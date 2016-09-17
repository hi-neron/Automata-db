'use strict'

const test = require('ava')
const Db = require('../')
const r = require('rethinkdb')
const uuid = require('uuid-base62')
const fixtures = require('./fixtures')
// const utils = require('../lib/utils')

test.beforeEach('Setup database each test', async t => {
  const dbName = `automata_${uuid.v4()}`
  const db = new Db({ db: dbName, setup: true })
  t.context.db = db
  t.context.dbName = dbName
  await db.connect()
  t.true(db.connected, 'Debe estar coenectado')
})

test.afterEach.always('Clean up', async t => {
  let db = t.context.db
  let dbName = t.context.dbName

  await db.disconnect()
  t.false(db.connected, 'Debe desconectase')

  let conn = await r.connect({})
  await r.dbDrop(dbName).run(conn)
})

test('updateGrid', async t => {
  let db = t.context.db
  t.is(typeof db.updateGrid, 'function')
  let grid = fixtures.getGrid()

  let updatedGrid = await db.updateGrid(grid)
  t.truthy(updatedGrid.date)
})

test('getGrid', async t => {
  let db = t.context.db
  t.is(typeof db.getGrid, 'function')

  let grid = fixtures.getGrid()

  await db.updateGrid(grid)
  await db.updateGrid(grid)

  let savedGrid = await db.getGrid()
  console.log(savedGrid)
  t.deepEqual(savedGrid.grid.length, 3)
  t.deepEqual(savedGrid.grid[0].length, 3)
  t.truthy(savedGrid.date)
})
