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

test('authenticate', async t => {
  let db = t.context.db
  t.is(typeof db.authenticate, 'function', 'should be')

  let user = fixtures.getUser()
  await db.createUser(user)

  let authenticate = await db.authenticate(user.username, user.password)
  t.truthy(authenticate)

  let authenticate2 = await db.authenticate(user.username, 'f4lsyP4ss')
  t.falsy(authenticate2)
})
