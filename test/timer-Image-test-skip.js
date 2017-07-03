'use strict'

const test = require('ava')
const Db = require('../')
const r = require('rethinkdb')
const uuid = require('uuid-base62')
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

test('Create images every two hours', async t => {
  let db = t.context.db
  t.is(typeof db.addMessage, 'function', 'Should have an addMessage function')

  let user = fixtures.getUser()
  let image = fixtures.getImage()
  let image2 = fixtures.getImage()
  let image3 = fixtures.getImage()

  let userCreated = await db.createUser(user)
  image.userId = userCreated.username
  image2.userId = userCreated.username

  await db.createPicture(image)

  image3.userId = userCreated.username

  t.throws(db.createPicture(image3), /1:59/)
})
