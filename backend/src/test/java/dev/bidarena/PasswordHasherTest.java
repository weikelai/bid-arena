package dev.bidarena;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PasswordHasherTest {
    @Test void saltedHashesVerifyWithoutStoringThePassword() {
        PasswordHasher hasher = new PasswordHasher();
        char[] password = "a-test-only-password".toCharArray();
        String first = hasher.hash(password);
        String second = hasher.hash(password);
        assertNotEquals(first, second);
        assertFalse(first.contains(new String(password)));
        assertTrue(hasher.verify(password, first));
        assertFalse(hasher.verify("wrong".toCharArray(), first));
        assertFalse(hasher.verify(password, "malformed"));
    }
}
