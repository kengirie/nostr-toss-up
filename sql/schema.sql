-- Create users table
CREATE TABLE users (
  pubkey TEXT UNIQUE NOT NULL PRIMARY KEY,
  registration_date DATE NOT NULL,
  existing_user INTEGER DEFAULT 1
);

-- Create indexes
CREATE INDEX idx_registration_date ON users(registration_date);
CREATE INDEX idx_pubkey ON users(pubkey);
