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
  t.is(typeof db.editMasteries, 'function', 'editMastery should be')

  await db.disconnect()
  t.false(db.connected, 'Debe desconectase')

  let conn = await r.connect({})
  await r.dbDrop(dbName).run(conn)
})

// contribs functions
test.skip('create a contribution', async t => {
  let db = t.context.db
  t.is(typeof db.createContrib, 'function', 'createContrib should be')
  /*
    id: uuid
    title: 'title'
    dateAdded: date
    tags: arrays
    data: {
      type: 'message|image|feature',
      data: string,
      image: url
    }
    messages: [
      {
        dateAdded: date
        userName: String
        userId: String
        Message: string
        image: none ¡ url
        rate: number
      }
    ]
    comunityRate: number
    devResponse: string
    devApproval: boolean
  */
  let contrib = fixtures.getContrib()
  let user = fixtures.getUser()

  let createdUser = await db.createUser(user)
  let username = createdUser.username

  let result = await db.createContrib(contrib, username)
  console.log(result)

  // basics
  t.is(result.title, contrib.title, 'Should be same title')
  t.truthy(result.id, 'it should have an id')
  t.truthy(result.dateAdded, 'It should have a date')
  t.is(typeof result.user, 'object', 'Should be an object')

  // medir los datos del usuario
  t.is(result.user.publicId, createdUser.publicId, 'debe tener un id')
  t.is(result.user.userName, createdUser.username, 'debe tener un id')
  t.is(result.user.title, createdUser.title, 'debe tener un id')
  t.is(result.user.avatar, createdUser.avatar, 'debe tener un id')

  // encontrar los tags
  t.is(result.tags, ['#hagamos', '#amor'], 'deber tener las tags en el mensaje')

  // definir el tipo, el mensaje y la imagen (si la tiene)
  t.truthy(result.data, 'debe tener un objeto data')
  t.truthy(result.messages, 'debe tener un array de mensajes')
  t.truthy(result.comunityRate, 'debe tener un array de mensajes')
  t.truthy(result.devResponse, 'debe tener un array de mensajes')

  let contrib2 = contrib
  delete contrib2['title']
  let resultTwo = await t.throws(db.createContrib(contrib2, username))
  t.is(resultTwo.message, 'Invalid contribution title')

  let contrib3 = contrib
  delete contrib3['data']
  let resultThree = await t.throws(db.createContrib(contrib3, username))
  t.is(resultThree.message, 'Invalid contribution data')
})

test('get tags from message', t => {
  t.is(typeof utils.getTags, 'function', 'editMastery should be')
  let contrib = fixtures.getContrib()
  let tags = utils.getTags(contrib.data.info)
  t.deepEqual(tags, ['#hagamos', '#amor'])

  let errorinfo = '#this #is #a #bad #message #with #so #much #tags'
  let errorinfo2 = '#thisIsABadMessageWithSoMuchTags'

  let badTags = utils.getTags(errorinfo)
  let badTagsTwo = utils.getTags(errorinfo2)

  t.is(badTags.length, 5, 'max 5 tags')
  t.is(badTagsTwo.length, 0, 'null tags')
})

test.todo('delete a contribution')
test.todo('modify a contribution')
test.todo('rate contribution')
test.todo('active a evaluate mode for a contribution')
test.todo('add a message to a contribution')
test.todo('add dev response')

// utils
test.todo('get a contribution')
test.todo('get last ten contributions')
