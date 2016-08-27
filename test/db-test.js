'use strict'

const test = require('ava')
const Db = require('../')
const r = require('rethinkdb')
const uuid = require('uuid-base62')
const fixtures = require('./fixtures')
const utils = require('../lib/utils')

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
  delete user.messages
  delete user.alerts

  t.deepEqual(result, user, 'should be the same')

  let dude = 'pepe'
  t.throws(db.getUser(dude), /not found/, 'User does not exists')
})

test('edit masteries', async t => {
  let db = t.context.db
  t.is(typeof db.editMasteries, 'function', 'editMastery should be')

  let mastery = ['Photography', 'Brand']

  let gettingUser = fixtures.getUser()
  let user = await db.createUser(gettingUser)
  let result = await db.editMasteries(gettingUser.username, mastery)

  t.is(result.username, user.username, 'should be the same username')
  t.deepEqual(result.masteries.map(utils.capitalize), mastery, 'should have a masteries')

  let dude = 'pepe'
  t.throws(db.editMasteries(dude, mastery), /not found/)
})

test('get Users By Masteries', async t => {
  let db = t.context.db
  t.is(typeof db.getUsersByMastery, 'function', 'getByMasteries')

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

  let byMastery = await db.getUsersByMastery(mastery)

  t.is(byMastery.length, random, 'it should has the same size')
})

test('addAvatar', async t => {
  let db = t.context.db
  t.is(typeof db.addAvatar, 'function', 'addAvatar to user function')

  let avatar = 'reel.jpg'
  let dude = 'pepe'

  let user = fixtures.getUser()
  await db.createUser(user)
  let userWAvatar = await db.addAvatar(user.username, avatar)

  t.deepEqual(userWAvatar.avatar, avatar, 'user must be have an avatar')
  t.throws(db.addAvatar(dude), /not found/)
})

test('AddMessage', async t => {
  let db = t.context.db
  t.is(typeof db.addMessage, 'function', 'Should have an addMessage function')

  let user = fixtures.getUser()
  let emisor = fixtures.getUser()

  let dude = 'pepe'
  let data = fixtures.getMessage()
  let fakeData = data
  data.from = emisor.username

  await db.createUser(emisor)
  await db.createUser(user)

  let result = await db.addMessage(user.username, data)

  t.truthy(result.messages[0].id)
  t.truthy(result.messages[0].date)
  t.deepEqual(result.messages[0].message, data.message)
  t.deepEqual(result.messages[0].from.name, emisor.name)

  t.throws(db.addMessage(dude, data), /not found/)
  delete fakeData.from
  t.throws(db.addMessage(user.username, fakeData), /invalid/)
})

test('AddAlert', async t => {
  let db = t.context.db
  t.is(typeof db.addAlert, 'function', 'Should have an addAlert function')

  let user = fixtures.getUser()
  let user2 = fixtures.getUser()
  let alert = fixtures.getAlert()
  let alert2 = fixtures.getAlert()
  alert2.from = user2.username
  let dude = 'pepe'

  await db.createUser(user)
  await db.createUser(user2)

  let result = await db.addAlert(user.username, alert)
  let fakeAlert = alert
  delete fakeAlert.type

  t.truthy(result.alerts[0].id)
  t.truthy(result.alerts[0].date)
  t.truthy(result.alerts[0].type)
  t.deepEqual(result.alerts[0].from, alert.from)
  t.deepEqual(result.alerts[0].message, alert.message)

  let result2 = await db.addAlert(user.username, alert2)

  t.deepEqual(result2.alerts[0].message, alert2.message)

  t.throws(db.addAlert(dude, alert), /not found/)
  t.throws(db.addAlert(user.username, fakeAlert), /invalid/)
})

test('GetCommunications', async t => {
  let db = t.context.db
  t.is(typeof db.getCommunications, 'function', 'Should have an getCommunications function')

  let user = fixtures.getUser()
  let user2 = fixtures.getUser()
  let alert = fixtures.getAlert()
  let message = fixtures.getMessage()
  let message2 = fixtures.getMessage()

  let dude = 'foo user'

  message.from = user2.username
  message2.from = user2.username

  await db.createUser(user2)
  await db.createUser(user)

  await db.addMessage(user.username, message)
  await db.addMessage(user.username, message2)
  await db.addAlert(user.username, alert)

  let result = await db.getCommunications(user.username)

  t.is(typeof result, 'object')
  t.is(result.communications.length, 3)

  t.throws(db.getCommunications(dude), /not found/)
})

test('AddBadge', async t => {
  let db = t.context.db
  t.is(typeof db.addBadge, 'function', 'addBadge to user function')

  let badge = 'artista'
  let dude = 'pepe'

  let user = fixtures.getUser()
  await db.createUser(user)

  let userBadge = await db.addBadge(user.username, badge)

  t.truthy(userBadge.badges[0].date)
  t.deepEqual(userBadge.badges[0].name, badge, 'user must be have an avatar')

  t.throws(db.addBadge(user.username), /invalid/)
  t.throws(db.addBadge(user.username, 'no existo'), /invalid/)
  t.throws(db.addBadge(dude, badge), /not found/)
})

test('addSkill', async t => {
  let db = t.context.db
  t.is(typeof db.addSkill, 'function', 'addSkill to user function')

  let skill = 'crab'
  let dude = 'pepe'

  let user = fixtures.getUser()
  await db.createUser(user)

  let userSkills = await db.addSkill(user.username, skill)

  t.deepEqual(userSkills.skills[0], skill, 'user must be have an avatar')

  t.throws(db.addSkill(user.username), /invalid/)
  t.throws(db.addSkill(user.username, 'no existo'), /invalid/)
  t.throws(db.addSkill(dude, skill), /not found/)
})

test('addPoints', async t => {
  let db = t.context.db
  t.is(typeof db.addPoints, 'function', 'addPoints to user function')

  let dude = 'pepe'

  let user = fixtures.getUser()
  await db.createUser(user)

  await db.addPoints(user.username, 3)
  let userPoints = await db.addPoints(user.username, 5)

  t.truthy(userPoints.points)
  t.deepEqual(userPoints.points, 8)
  t.throws(db.addPoints(dude), /not found/)
})

// // images - movement
// test.todo('AddPos')
// test.todo('ChangePos')
