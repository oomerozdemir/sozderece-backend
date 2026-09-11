-- Ödeme sayfası güvence kutusu için paket bazlı override. İkisi de
-- opsiyonel/varsayılanlı, mevcut satırlar etkilenmez.
ALTER TABLE "Package" ADD COLUMN "guaranteeText" TEXT;
ALTER TABLE "Package" ADD COLUMN "noRefund" BOOLEAN NOT NULL DEFAULT false;
