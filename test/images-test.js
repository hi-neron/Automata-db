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

test('create picture', async t => {
  let db = t.context.db
  t.is(typeof db.createPicture, 'function', 'Should be')

  let user = fixtures.getUser()
  let image = fixtures.getImage()

  let userDb = await db.createUser(user)
  image.userId = userDb.publicId

  let imageDb = await db.createPicture(image)

  t.truthy(imageDb.createdAt)
  t.is(imageDb.url, image.url)
  t.is(imageDb.userId, userDb.publicId)

  let fakeImageWUser = image
  fakeImageWUser.userId = 'f4ls3k3y'
  t.throws(db.createPicture(fakeImageWUser), /not found/)

  let fakeImage = image
  delete fakeImage.src
  t.throws(db.createPicture(fakeImage), /invalid/)
})

test('get Picture', async t => {
  let db = t.context.db
  t.is(typeof db.getPicture, 'function', 'Should be')

  let user = fixtures.getUser()
  let image = fixtures.getImage()

  let userDb = await db.createUser(user)

  image.userId = userDb.publicId

  let imageDb = await db.createPicture(image)

  let publicKey = imageDb.publicId

  let imageObtanined = await db.getPicture(publicKey)

  t.is(imageObtanined.url, image.url)
  t.is(imageObtanined.description, image.description)
  t.is(imageObtanined.userId, imageDb.userId)
  t.truthy(imageObtanined.createdAt)

  let fakeImage = '12345'

  t.throws(db.getPicture(fakeImage), /not found/)
})

test('get all Pictures', async t => {
  let db = t.context.db
  t.is(typeof db.getAllPictures, 'function', 'Should be')

  let users = fixtures.getUsers(10)
  let images = fixtures.getImages(10)
  let usersList = []
  let imageList = []

  for (let i = 0; i < users.length; i++) {
    usersList.push(db.createUser(users[i]))
  }

  let usersDb = await Promise.all(usersList)

  for (let i = 0; i < images.length; i++) {
    images[i].userId = usersDb[i].publicId
    imageList.push(db.createPicture(images[i]))
  }

  await Promise.all(imageList)
  let imagesDb = await db.getAllPictures()

  t.is(imagesDb.length, images.length)
})

test('delete Picture', async t => {
  let db = t.context.db
  t.is(typeof db.deletePicture, 'function', 'Should be')

  let user = fixtures.getUser()
  let image = fixtures.getImage()
  let userDb = await db.createUser(user)
  image.userId = userDb.publicId
  let imageDb = await db.createPicture(image)
  let publicKey = imageDb.publicId

  let response = await db.deletePicture(publicKey)

  t.is(response.status, 'ok')
  t.is(response.code, 204)

  t.throws(db.getPicture(publicKey), /not found/)

  let fakeImage = '12345'

  t.throws(db.deletePicture(fakeImage), /not found/)
})

test('add picture award', async t => {
  let db = t.context.db
  t.is(typeof db.addPictureAward, 'function', 'Should be')

  let user = fixtures.getUser()
  let userSponsor = fixtures.getUser()
  let userSponsor2 = fixtures.getUser()
  let image = fixtures.getImage()

  let sponsorName = userSponsor.username
  let sponsorName2 = userSponsor2.username

  let userDb = await db.createUser(user)
  await db.createUser(userSponsor)
  await db.createUser(userSponsor2)

  image.userId = userDb.publicId

  let imageDb = await db.createPicture(image)

  let publicKey = imageDb.publicId

  let award = {
    sponsor: sponsorName,
    type: 'amazing'
  }

  let award2 = {
    sponsor: sponsorName2,
    type: 'amazing'
  }

  await db.addPictureAward(publicKey, award)

  let imageAcquired = await db.getPicture(publicKey)
  t.is(imageAcquired.awards.amazing, 1)
  t.is(imageAcquired.sponsors[0], userSponsor.username)

  await db.addPictureAward(publicKey, award2)
  let imageAcquired2 = await db.getPicture(publicKey)
  t.is(imageAcquired2.awards.amazing, 2)
  t.is(imageAcquired2.sponsors[1], userSponsor2.username)

  t.throws(db.addPictureAward(publicKey, award), /already/)

  t.throws(db.addPictureAward('failT3stKey', award), /not found/)

  award.type = 'fake'
  t.throws(db.addPictureAward(publicKey, award), /invalid/)
})

test('get Picture By User', async t => {
  let db = t.context.db
  t.is(typeof db.getPicturesByUser, 'function', 'Should be')

  let users = fixtures.getUsers(10)
  let images = fixtures.getImages(10)
  let usersList = []
  let imageList = []

  for (let i = 0; i < users.length; i++) {
    usersList.push(db.createUser(users[i]))
  }

  let usersDb = await Promise.all(usersList)

  for (let i = 0; i < images.length; i++) {
    images[i].userId = usersDb[i].publicId
    imageList.push(db.createPicture(images[i]))
  }

  let username = usersDb[4].username

  await Promise.all(imageList)

  let imagesDb = await db.getPicturesByUser(username)
  t.is(imagesDb[0].userId, usersDb[4].publicId)

  t.throws(db.getPicturesByUser('foo'), /not found/)
})
