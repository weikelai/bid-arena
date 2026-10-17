param(
    [Parameter(Mandatory=$true)][string]$MysqlBin,
    [ValidateSet('start','stop')][string]$Action='start'
)
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$instance=Join-Path $workspace '.local\mysql-it'
$envPath=Join-Path $workspace '.local\test.env'
$mysqld=Join-Path $MysqlBin 'mysqld.exe'
$mysqladmin=Join-Path $MysqlBin 'mysqladmin.exe'
if(-not (Test-Path -LiteralPath $mysqld)){throw 'MysqlBin must contain MySQL 8 mysqld.exe'}
if($Action -eq 'stop') {
    if(-not (Test-Path -LiteralPath $envPath)){throw 'No local test credentials found'}
    $values=@{}
    Get-Content -LiteralPath $envPath | ForEach-Object {if($_ -match '^([^=]+)=(.*)$'){$values[$matches[1]]=$matches[2]}}
    $env:MYSQL_PWD=$values.TEST_DB_PASSWORD
    try { & $mysqladmin --no-defaults --protocol=TCP --host=127.0.0.1 --port=3307 --user=stage1_test shutdown; if($LASTEXITCODE -ne 0){throw 'Local MySQL shutdown failed'} }
    finally {Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue}
    exit
}
if(Get-NetTCPConnection -LocalPort 3307 -State Listen -ErrorAction SilentlyContinue){throw 'Port 3307 is occupied; leave the existing instance unchanged'}
New-Item -ItemType Directory -Force -Path $instance | Out-Null
if(-not (Test-Path -LiteralPath $envPath)) {
    if(Test-Path -LiteralPath (Join-Path $instance 'mysql')){throw 'Existing data without test.env: do not reset credentials automatically'}
    $bytes=New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret=[Convert]::ToBase64String($bytes)
    [IO.File]::WriteAllText($envPath,"TEST_DB_URL=jdbc:mysql://127.0.0.1:3307/?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&allowPublicKeyRetrieval=true&useSSL=false`nTEST_DB_USER=stage1_test`nTEST_DB_PASSWORD=$secret`n")
} else {
    $values=@{}
    Get-Content -LiteralPath $envPath | ForEach-Object {if($_ -match '^([^=]+)=(.*)$'){$values[$matches[1]]=$matches[2]}}
    $secret=$values.TEST_DB_PASSWORD
}
$base=[IO.Path]::GetFullPath((Join-Path $MysqlBin '..'))
if(-not (Test-Path -LiteralPath (Join-Path $instance 'mysql'))) {
    $initialize=Start-Process -FilePath $mysqld -ArgumentList '--no-defaults','--initialize-insecure',"--basedir=`"$base`"","--datadir=`"$instance`"" -WindowStyle Hidden -PassThru -Wait -RedirectStandardError (Join-Path $instance 'initialize.log')
    if($initialize.ExitCode -ne 0){throw 'Initialization failed; inspect .local/mysql-it/initialize.log'}
}
$bootstrap=Join-Path $instance 'bootstrap.sql'
[IO.File]::WriteAllText($bootstrap,"CREATE USER IF NOT EXISTS 'stage1_test'@'127.0.0.1' IDENTIFIED BY '$secret';`nGRANT ALL PRIVILEGES ON *.* TO 'stage1_test'@'127.0.0.1';`nALTER USER 'root'@'localhost' IDENTIFIED BY '$secret';`nCREATE DATABASE IF NOT EXISTS bid_arena CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`n")
$process=Start-Process -FilePath $mysqld -ArgumentList '--no-defaults',"--basedir=`"$base`"","--datadir=`"$instance`"",'--port=3307','--bind-address=127.0.0.1','--mysqlx=0',"--init-file=`"$bootstrap`"","--log-error=`"$instance\error.log`"" -WindowStyle Hidden -PassThru
for($i=0;$i -lt 60;$i++) {
    if($process.HasExited){throw 'Server exited; inspect .local/mysql-it/error.log'}
    $client=New-Object Net.Sockets.TcpClient
    try {$client.Connect('127.0.0.1',3307); Write-Output 'Local MySQL ready on loopback:3307; credentials are in ignored .local/test.env'; exit}
    catch {Start-Sleep -Milliseconds 250}
    finally {$client.Dispose()}
}
throw 'Server startup timed out; inspect .local/mysql-it/error.log'
