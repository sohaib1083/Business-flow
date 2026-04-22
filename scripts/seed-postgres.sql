-- Financial transactions demo database
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS merchants;

CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  country TEXT NOT NULL,
  signup_date DATE NOT NULL
);

CREATE TABLE merchants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL
);

CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  merchant_id INT NOT NULL REFERENCES merchants(id),
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL,
  transaction_date TIMESTAMP NOT NULL,
  payment_method TEXT NOT NULL
);

INSERT INTO customers (name, email, country, signup_date) VALUES
  ('Ava Patel','ava@example.com','US','2024-01-05'),
  ('Noah Kim','noah@example.com','US','2024-02-12'),
  ('Mia Chen','mia@example.com','CA','2024-03-03'),
  ('Liam Garcia','liam@example.com','MX','2024-03-28'),
  ('Emma Johnson','emma@example.com','UK','2024-04-15'),
  ('Oliver Smith','oliver@example.com','UK','2024-05-01'),
  ('Sophia Rossi','sophia@example.com','IT','2024-06-10'),
  ('Lucas Muller','lucas@example.com','DE','2024-07-02'),
  ('Isabella Silva','isabella@example.com','BR','2024-07-18'),
  ('Ethan Tanaka','ethan@example.com','JP','2024-08-22'),
  ('Amelia Singh','amelia@example.com','IN','2024-09-05'),
  ('Mason Dubois','mason@example.com','FR','2024-09-30'),
  ('Harper Nguyen','harper@example.com','VN','2024-10-12'),
  ('Logan Brown','logan@example.com','US','2024-11-04'),
  ('Evelyn Park','evelyn@example.com','KR','2024-12-01');

INSERT INTO merchants (name, category) VALUES
  ('Amazon','Retail'),
  ('Whole Foods','Groceries'),
  ('Shell','Fuel'),
  ('Netflix','Entertainment'),
  ('Uber','Transport'),
  ('Starbucks','Food & Drink'),
  ('Apple','Electronics'),
  ('Delta Airlines','Travel'),
  ('Airbnb','Travel'),
  ('Spotify','Entertainment'),
  ('Target','Retail'),
  ('CVS Pharmacy','Healthcare');

-- Generate ~1200 transactions over the last year
INSERT INTO transactions (customer_id, merchant_id, amount, currency, status, transaction_date, payment_method)
SELECT
  1 + (random() * 14)::int,
  1 + (random() * 11)::int,
  ROUND((random() * 480 + 5)::numeric, 2),
  (ARRAY['USD','USD','USD','EUR','GBP'])[1 + (random()*4)::int],
  (ARRAY['completed','completed','completed','completed','completed','failed','refunded'])[1 + (random()*6)::int],
  NOW() - (random() * INTERVAL '365 days'),
  (ARRAY['credit_card','debit_card','credit_card','bank_transfer','paypal'])[1 + (random()*4)::int]
FROM generate_series(1, 1200);

CREATE INDEX idx_tx_customer ON transactions(customer_id);
CREATE INDEX idx_tx_merchant ON transactions(merchant_id);
CREATE INDEX idx_tx_date ON transactions(transaction_date);
