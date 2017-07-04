'use strict'

const test = require('ava')
const Db = require('../')
const r = require('rethinkdb')
const uuid = require('uuid-base62')
const utils = require('../lib/utils')
const fixtures = require('./fixtures')

test.beforeEach('Setup database each test', async t => {
  const dbName = `automata_${uuid.v4()}`
  const db = new Db({ db: dbName, setup: true })
  t.context.db = db
  t.context.dbName = dbName
  await db.connect()
  t.true(db.connected, 'Debe estar conectado')
})

test.afterEach.always('Clean up', async t => {
  let db = t.context.db
  let dbName = t.context.dbName

  await db.disconnect()
  t.false(db.connected, 'Debe desconectase')

  let conn = await r.connect({})
  await r.dbDrop(dbName).run(conn)
})

test('edit masteries', async t => {
  let db = t.context.db
  t.is(typeof db.editMasteries, 'function', 'editMastery should be')

  let mastery = ['Photography', 'Drawing']

  let gettingUser = fixtures.getUser()
  let user = await db.createUser(gettingUser)
  let result = await db.editMasteries(gettingUser.username, mastery)

  t.is(result.username, user.username, 'should be the same username')
  t.deepEqual(result.masteries.map(utils.capitalize), mastery, 'should have a masteries')

  let dude = 'pepe'
  t.throws(db.editMasteries(dude, mastery), /not found/)

  let masteries2 = ['drawing', 'Photography', 'writing', 'motion']
  let resultTwo = await db.editMasteries(gettingUser.username, masteries2)

  t.is(resultTwo.username, user.username, 'should be the same username')
  t.deepEqual(resultTwo.masteries.length, 3, 'should have three items')

  masteries2 = ['nada', 'enAbsoluto']
  let resultthree = await t.throws(db.editMasteries(gettingUser.username, masteries2))
  t.is(resultthree.message, 'Mastery not found')
})

test('change personal title with badge', t => {
  let db = t.context.db
  t.is(typeof db.addMessage, 'function', 'Should have an addMessage function')
})
