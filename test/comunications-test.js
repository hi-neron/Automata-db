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

test('Get masteries list', async t => {
  let db = t.context.db
  t.is(typeof db.addMessage, 'function', 'Should have an addMessage function')
  // start test to get masteries list
  let masteries = utils.getMasteries()
  console.log(masteries)
  t.is(masteries.length, 6, 'lenght should be six')
})

test('Get the three masteries user list', async t => {
  let db = t.context.db
  t.is(typeof db.addMessage, 'function', 'Should have an addMessage function')
})

test('edit masteries', async t => {
  let db = t.context.db
  t.is(typeof db.editMasteries, 'function', 'editMastery should be')

  let masteries = utils.getMasteries()
  let mastery = ['Photography', 'Brand']

  let gettingUser = fixtures.getUser()
  let user = await db.createUser(gettingUser)
  let result = await db.editMasteries(gettingUser.username, mastery)

  console.log(result)
  t.is(user.masteries, masteries, 'should be official masteries')
  t.is(result.username, user.username, 'should be the same username')
  t.deepEqual(result.masteries.map(utils.capitalize), mastery, 'should have a masteries')

  let dude = 'pepe'
  t.throws(db.editMasteries(dude, mastery), /not found/)

  let masteries2 = ['nana', 'nada', 'otroa', 'third']
  let resultTwo = await db.editMasteries(gettingUser.username, masteries2)

  console.log
  t.is(resultTwo.username, user.username, 'should be the same username')
  t.deepEqual(resultTwo.masteries.length, 3, 'should have three items')
})

test('change personal title with badge', t => {
  let db = t.context.db
  t.is(typeof db.addMessage, 'function', 'Should have an addMessage function')
})

// test.skip('Create images every two hours', async t => {
//   let db = t.context.db
//   t.is(typeof db.addMessage, 'function', 'Should have an addMessage function')

//   let user = fixtures.getUser()
//   let image = fixtures.getImage()
//   let image2 = fixtures.getImage()
//   let image3 = fixtures.getImage()

//   let userCreated = await db.createUser(user)
//   image.userId = userCreated.username
//   image2.userId = userCreated.username

//   await db.createPicture(image)

//   image3.userId = userCreated.username

//   t.throws(db.createPicture(image3), /1:59/)
// })
