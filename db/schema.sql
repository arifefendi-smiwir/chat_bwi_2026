-- =====================================================
-- Elytra - Skema Database (MySQL 8)
-- Menangani 3 peran: admin, seller, pembeli
-- =====================================================

CREATE DATABASE IF NOT EXISTS elytra
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE elytra;

-- -----------------------------------------------------
-- Pengguna (semua peran)
-- -----------------------------------------------------
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nama          VARCHAR(100)  NOT NULL,
  email         VARCHAR(150)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  role          ENUM('admin','seller','pembeli') NOT NULL DEFAULT 'pembeli',
  aktif         TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- Toko (profil seller; 1 seller = 1 toko)
-- -----------------------------------------------------
CREATE TABLE toko (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id   INT UNSIGNED NOT NULL UNIQUE,
  nama_toko VARCHAR(100) NOT NULL,
  wa        VARCHAR(15)  NOT NULL DEFAULT '6281200000000',
  deskripsi VARCHAR(300) NULL,
  CONSTRAINT fk_toko_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- Kategori produk
-- -----------------------------------------------------
CREATE TABLE kategori (
  id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- Produk (dimiliki toko/seller)
-- -----------------------------------------------------
CREATE TABLE produk (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  toko_id     INT UNSIGNED NOT NULL,
  kategori_id INT UNSIGNED NOT NULL,
  nama        VARCHAR(150) NOT NULL,
  harga       INT UNSIGNED NOT NULL,
  stok        INT UNSIGNED NOT NULL DEFAULT 0,
  deskripsi   VARCHAR(600) NOT NULL DEFAULT '',
  image_url   VARCHAR(500) NOT NULL DEFAULT '',
  unggulan    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_produk_toko FOREIGN KEY (toko_id)
    REFERENCES toko(id) ON DELETE CASCADE,
  CONSTRAINT fk_produk_kategori FOREIGN KEY (kategori_id)
    REFERENCES kategori(id) ON DELETE RESTRICT,
  CONSTRAINT chk_produk_harga CHECK (harga >= 0),
  CONSTRAINT chk_produk_stok CHECK (stok >= 0)
) ENGINE=InnoDB;
CREATE INDEX idx_produk_nama ON produk(nama);
CREATE INDEX idx_produk_kategori ON produk(kategori_id);

-- -----------------------------------------------------
-- Keranjang (pembeli)
-- -----------------------------------------------------
CREATE TABLE keranjang (
  user_id   INT UNSIGNED NOT NULL,
  produk_id INT UNSIGNED NOT NULL,
  jumlah    INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, produk_id),
  CONSTRAINT fk_cart_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cart_produk FOREIGN KEY (produk_id)
    REFERENCES produk(id) ON DELETE CASCADE,
  CONSTRAINT chk_cart_jumlah CHECK (jumlah > 0)
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- Pesanan (header) - milik pembeli
-- -----------------------------------------------------
CREATE TABLE pesanan (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  total      INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pesanan_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_pesanan_total CHECK (total >= 0)
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- Item pesanan - snapshot produk saat dipesan,
-- status per-item agar tiap toko bisa memproses miliknya
-- -----------------------------------------------------
CREATE TABLE pesanan_item (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pesanan_id  INT UNSIGNED NOT NULL,
  produk_id   INT UNSIGNED NULL,
  toko_id     INT UNSIGNED NULL,
  nama_toko   VARCHAR(100) NOT NULL,
  nama_produk VARCHAR(150) NOT NULL,
  harga       INT UNSIGNED NOT NULL,
  jumlah      INT UNSIGNED NOT NULL,
  status      ENUM('baru','diproses','dikirim','selesai','batal') NOT NULL DEFAULT 'baru',
  CONSTRAINT fk_item_pesanan FOREIGN KEY (pesanan_id)
    REFERENCES pesanan(id) ON DELETE CASCADE,
  CONSTRAINT fk_item_produk FOREIGN KEY (produk_id)
    REFERENCES produk(id) ON DELETE SET NULL,
  CONSTRAINT fk_item_toko FOREIGN KEY (toko_id)
    REFERENCES toko(id) ON DELETE SET NULL,
  CONSTRAINT chk_item_harga CHECK (harga >= 0),
  CONSTRAINT chk_item_jumlah CHECK (jumlah > 0)
) ENGINE=InnoDB;
CREATE INDEX idx_item_pesanan ON pesanan_item(pesanan_id);
CREATE INDEX idx_item_toko ON pesanan_item(toko_id);
