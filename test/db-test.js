'use strict'

const test = require('ava')
const Db = require('../')
const r = require('rethinkdb')
const uuid = require('uuid-base62')
const fixtures = require('./fixtures')
const utils = require('../lib/utils')

test.beforeEach('Setup database each test', async t => {
  const dbName = `automata_${uuid.v4()}`
  const db = new Db({ db: dbName })
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

// Users
test('create user', async t => {
  let db = t.context.db
  t.is(typeof db.createUser, 'function', 'createUser should be')
  let user = fixtures.getUser()

  let passwd = utils.encrypt(user.password)

  let result = await db.createUser(user)
  t.is(result.name, user.name, 'Should be same name')
  t.is(result.userName, user.userName, 'Should be same userName')
  t.is(result.email, user.email, 'Should be same email')
  t.is(result.password, passwd, 'Should be the same password encrypted')
  t.is(result.points, 0, 'Should have an id')
  t.is(typeof result.id, 'string', 'Should have an id')
  t.is(typeof result.alerts, 'object', 'Should be the same password encrypted')
  t.is(typeof result.messages, 'object', 'Should have an id')
  t.is(typeof result.skills, 'object', 'Should have an id')
  t.is(typeof result.masteries, 'object', 'Should have an id')
  t.truthy(result.createdAt)
})

test('get user', async t => {
  let db = t.context.db
  t.is(typeof db.getUser, 'function', 'getUser should be')

  let gettingUser = fixtures.getUser()
  let user = await db.createUser(gettingUser)
  let result = await db.getUser(gettingUser.username)

  t.deepEqual(result, user, 'should be the same')
})

test('edit masteries', async t => {
  let db = t.context.db
  t.is(typeof db.editMasteries, 'function', 'editMastery should be')

  let mastery = ['Photography', 'Brand']

  let gettingUser = fixtures.getUser()
  let user = await db.createUser(gettingUser)
  let result = await db.editMasteries(gettingUser.username, mastery)

  t.is(result.username, user.username, 'should be the same username')
  t.deepEqual(result.masteries, mastery, 'should have a masteries')
})

test('getByMasteries', async t => {
  let db = t.context.db
  t.is(typeof db.getByMasteries, 'function', 'getByMasteries')

  let users = fixtures.getUsers(10)
  let random = Math.round(Math.random() * users.length)

  let mastery = 'Photography'
  let usersContainer = []
  let masteriesContainer = []

  for (let i = 0; i < users.length; i++) {
    usersContainer.push(db.createUser(users[i]))
    if (i < random) {
      masteriesContainer.push(db.editMasteries(users[i].username, mastery))
    }
  }

  await Promise.all(usersContainer)
  await Promise.all(masteriesContainer)

  let byMastery = await db.getByMasteries(mastery)

  t.is(byMastery.length, random, 'it should has the same size')
})

// test.todo('addAvatar')
// test.todo('addImage')
// test.todo('GetComunitations')
// tess.todo('AddBadge')
// tess.todo('GetBadge')
// test.todo('AddSkill')
// test.todo('GetSkill')
// test.todo('GetSkills')
// test.todo('AddPoint')
// test.todo('GetPoints')
// test.todo('AddMessage')
// test.todo('GetMessages')
// test.todo('AddAlert')
// test.todo('GetAlerts')

// // images
// test.todo('GetPicture')
// test.todo('GetAllPictures')
// test.todo('savePicture')
// test.todo('deletePicture')
// test.todo('getByTag')
// test.todo('addAward')
// test.todo('getByUser')

// // images - movement
// test.todo('AddPos')
// test.todo('ChangePos')

// // Auth
// test.todo('auth')

// // Grid
// test.todo('createGrid')
// test.todo('getGrid')
// test.todo('UpdateGrid')

// // Challenges
// test.todo('getChallenge')
// test.todo('createChallenge')
// test.todo('addUserChallenge')
