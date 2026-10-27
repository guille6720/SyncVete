import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migration = (name: string) =>
  readFileSync(resolve(process.cwd(), '../../supabase/migrations', name), 'utf8');
async function executeMigration(name: string, sql = migration(name)) {
  try {
    await database.exec(sql);
  } catch (error) {
    const detail = error as { message: string; position?: string };
    const position = Number(detail.position) || 0;
    throw new Error(
      `${name}: ${detail.message} at ${position}: ${sql.slice(Math.max(0, position - 120), position + 120)}`
    );
  }
}
const orgA = 'a0000000-0000-4000-8000-000000000001';
const orgB = 'b0000000-0000-4000-8000-000000000001';
const branch = 'a0000000-0000-4000-8000-000000000002';
const supplier = 'a0000000-0000-4000-8000-000000000003';
const category = 'a0000000-0000-4000-8000-000000000004';
const product = 'a0000000-0000-4000-8000-000000000005';
let database: PGlite;

async function asUser(org = orgA, write = true) {
  await database.exec(
    `set role authenticated; set request.org = '${org}'; set request.write = '${write}';`
  );
}
async function addProduct(extra = '') {
  await database.exec(
    `insert into inventory_products(id,organization_id,branch_id,name,category,unit_cost,margin_percent,supplier_party_id ${extra ? ',cost_currency' : ''}) values ('${product}','${orgA}','${branch}','Vacuna QA','vacuna',12.5,40,'${supplier}' ${extra ? ",'USD'" : ''});`
  );
}

describe('Compras database isolation, CRUD and pricing', () => {
  beforeAll(async () => {
    database = new PGlite();
    await database.exec(`
      create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;
      create table organizations(id uuid primary key);
      create table branches(id uuid primary key, organization_id uuid, deleted_at timestamptz);
      create table profiles(id uuid primary key, full_name text);
      create function get_user_organization_id() returns uuid language sql stable as $$select nullif(current_setting('request.org',true),'')::uuid$$;
      create function has_permission(permission text) returns boolean language sql stable as $$select permission='inventory:read' or current_setting('request.write',true)='true'$$;
      create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
      create function audit_log_changes() returns trigger language plpgsql as $$begin perform new.id; return new; end$$;
      grant usage on schema public, auth to authenticated, anon;
      grant select on branches to authenticated;
    `);
    await executeMigration('20240811000018_inventory.sql');
    await executeMigration(
      '20240811000039_fix_soft_delete_rls.sql',
      migration('20240811000039_fix_soft_delete_rls.sql')
        .split('-- Inventory')[1]
        .split('-- Pharmacy')[0]
    );
    await executeMigration('20261027143000_compras_catalog.sql');
    await executeMigration('20261027153648_compras_catalog_integrity.sql');
    await executeMigration('20261027172455_compras_party_cuit.sql');
    await database.exec(`grant select,insert,update on inventory_products to authenticated;
      insert into organizations values ('${orgA}'),('${orgB}');
      insert into branches(id,organization_id) values ('${branch}','${orgA}');
      insert into purchase_parties(id,organization_id,name,kind,scope) values ('${supplier}','${orgA}','Vacunas QA','proveedor','vacunas');
      insert into purchase_categories(id,organization_id,name,base_category) values ('${category}','${orgA}','Caninas','vacuna');`);
  }, 30000);
  beforeEach(async () => {
    await database.exec('begin');
    await asUser();
  });
  afterEach(async () => {
    await database.exec('rollback; reset role');
  });
  afterAll(async () => {
    await database?.close();
  });

  it('enforces calculated prices on direct writes and reprices USD products', async () => {
    await database.exec(
      `insert into purchase_pricing_settings(organization_id,usd_ars) values ('${orgA}',1200)`
    );
    await addProduct('USD');
    let result = await database.query<{ unit_price: string }>(
      'select unit_price from inventory_products'
    );
    expect(Number(result.rows[0].unit_price)).toBe(21000);
    await database.exec(`update inventory_products set unit_price=1 where id='${product}'`);
    result = await database.query('select unit_price from inventory_products');
    expect(Number(result.rows[0].unit_price)).toBe(21000);
    await database.exec(
      `update purchase_pricing_settings set usd_ars=1300 where organization_id='${orgA}'`
    );
    result = await database.query('select unit_price from inventory_products');
    expect(Number(result.rows[0].unit_price)).toBe(22750);
  });
  it('requires a valid exchange rate for USD', async () => {
    await expect(addProduct('USD')).rejects.toThrow(/cotización/);
  });
  it('calculates ARS zero-margin costs and keeps manual ARS sale prices', async () => {
    await addProduct();
    await database.exec('update inventory_products set unit_cost=100,margin_percent=0');
    expect(
      Number(
        (await database.query<{ unit_price: string }>('select unit_price from inventory_products'))
          .rows[0].unit_price
      )
    ).toBe(100);
    await database.exec('update inventory_products set margin_percent=null,unit_price=999');
    expect(
      Number(
        (await database.query<{ unit_price: string }>('select unit_price from inventory_products'))
          .rows[0].unit_price
      )
    ).toBe(999);
  });
  it('rejects cross-tenant suppliers even through direct database access', async () => {
    await database.exec(
      `reset role; insert into purchase_parties(id,organization_id,name,kind,scope) values ('b0000000-0000-4000-8000-000000000003','${orgB}','Otra veterinaria','proveedor','vacunas');`
    );
    await asUser();
    await addProduct();
    await expect(
      database.exec(
        `update inventory_products set supplier_party_id='b0000000-0000-4000-8000-000000000003'`
      )
    ).rejects.toThrow(/proveedor/);
  });
  it('rejects general suppliers for vaccines', async () => {
    await database.exec(`update purchase_parties set scope='general' where id='${supplier}'`);
    await expect(addProduct()).rejects.toThrow(/proveedor/);
  });
  it('prevents changing a referenced supplier scope', async () => {
    await addProduct();
    await expect(
      database.exec(`update purchase_parties set scope='general' where id='${supplier}'`)
    ).rejects.toThrow(/vinculados/);
  });
  it('creates, updates and soft-deletes categories and parties', async () => {
    await database.exec(
      `update purchase_categories set name='Felinas' where id='${category}'; update purchase_categories set deleted_at=now() where id='${category}'; update purchase_parties set deleted_at=now() where id='${supplier}';`
    );
    expect(
      (await database.query('select * from purchase_categories where deleted_at is null')).rows
    ).toHaveLength(0);
    expect(
      (await database.query('select * from purchase_parties where deleted_at is null')).rows
    ).toHaveLength(0);
  });
  it('guards category assignment and deletion of linked records', async () => {
    await addProduct();
    await database.exec(`update inventory_products set catalog_category_id='${category}'`);
    await expect(
      database.exec(`update purchase_categories set deleted_at=now() where id='${category}'`)
    ).rejects.toThrow(/vinculados/);
  });
  it('allows soft-deleting products and preserves the record', async () => {
    await addProduct();
    await database.exec('update inventory_products set deleted_at=now(),is_active=false');
    expect(
      (await database.query('select * from inventory_products where deleted_at is null')).rows
    ).toHaveLength(0);
    expect((await database.query('select * from inventory_products')).rows).toHaveLength(1);
  });
  it('isolates reads and updates between veterinarias', async () => {
    await addProduct();
    await database.exec('reset role');
    await asUser(orgB);
    expect((await database.query('select * from inventory_products')).rows).toHaveLength(0);
    expect((await database.query('select * from purchase_parties')).rows).toHaveLength(0);
    expect((await database.query('select * from purchase_categories')).rows).toHaveLength(0);
    expect(
      (await database.query("update inventory_products set name='Intruso' returning id")).rows
    ).toHaveLength(0);
  });
  it('denies writes to read-only roles', async () => {
    await database.exec('reset role');
    await asUser(orgA, false);
    await expect(
      database.exec(
        `insert into purchase_categories(organization_id,name,base_category) values ('${orgA}','Bloqueada','otro')`
      )
    ).rejects.toThrow(/row-level security/);
  });
  it('denies anonymous table access', async () => {
    await database.exec('reset role; set role anon');
    await expect(database.query('select * from purchase_pricing_settings')).rejects.toThrow(
      /permission denied/
    );
  });
  it('stores optional CUIT and rejects malformed direct writes', async () => {
    await database.exec(`update purchase_parties set cuit='30123456789' where id='${supplier}'`);
    expect(
      (await database.query<{ cuit: string }>('select cuit from purchase_parties')).rows[0].cuit
    ).toBe('30123456789');
    await expect(
      database.exec(`update purchase_parties set cuit='incorrecto' where id='${supplier}'`)
    ).rejects.toThrow(/check constraint/);
  });
  it('rejects inserts assigned to another organization', async () => {
    await expect(
      database.exec(
        `insert into purchase_categories(organization_id,name,base_category) values ('${orgB}','Ajena','otro')`
      )
    ).rejects.toThrow(/row-level security/);
  });
  it('prevents relocating products to another tenant', async () => {
    await addProduct();
    await expect(
      database.exec(`update inventory_products set organization_id='${orgB}'`)
    ).rejects.toThrow(/trasladar/);
  });
  it('prevents removing referenced suppliers', async () => {
    await addProduct();
    await expect(
      database.exec(`update purchase_parties set deleted_at=now() where id='${supplier}'`)
    ).rejects.toThrow(/vinculados/);
  });
  it('rejects zero exchange rates at the database boundary', async () => {
    await expect(
      database.exec(
        `insert into purchase_pricing_settings(organization_id,usd_ars) values ('${orgA}',0)`
      )
    ).rejects.toThrow(/check constraint/);
  });
  it('does not let read-only users alter exchange rates', async () => {
    await database.exec(
      `insert into purchase_pricing_settings(organization_id,usd_ars) values ('${orgA}',1200); reset role`
    );
    await asUser(orgA, false);
    expect(
      (
        await database.query(
          'update purchase_pricing_settings set usd_ars=1 returning organization_id'
        )
      ).rows
    ).toHaveLength(0);
  });
});
