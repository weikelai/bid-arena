ALTER TABLE bid_requests ADD COLUMN amount BIGINT NULL;
CREATE TABLE auction_intake (
 auction_id BIGINT NOT NULL PRIMARY KEY,
 CONSTRAINT fk_intake_auction FOREIGN KEY(auction_id) REFERENCES auctions(id)
) ENGINE=InnoDB;
INSERT INTO auction_intake(auction_id) SELECT id FROM auctions;
