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

// contribs functions
test('create a contribution', async t => {
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
  t.is(typeof result.id, 'string', 'it should have an id')
  t.true(result.dateAdded instanceof Date, 'It should have a date')
  t.is(typeof result.user, 'object', 'Should be an object')

  // medir los datos del usuario
  t.is(result.user.publicId, createdUser.publicId, 'debe tener un id')
  t.is(result.user.username, createdUser.username, 'debe tener un id')
  t.is(result.user.title, createdUser.title, 'debe tener un id')
  t.is(result.user.avatar, createdUser.avatar, 'debe tener un id')

  // encontrar los tags
  t.deepEqual(result.tags, ['#hagamos', '#amor'], 'deber tener las tags en el mensaje')

  // definir el tipo, el mensaje y la imagen (si la tiene)
  t.is(typeof result.data, 'object', 'debe tener un objeto data')
  t.true(result.messages instanceof Array, 'debe tener un array de mensajes')
  t.is(typeof result.comunityRate, 'number', 'debe tener un array de mensajes')
  t.is(typeof result.dev, 'object', 'debe tener un array de mensajes')
  t.is(typeof result.dev, 'object', 'debe existir info del dev')
  t.is(result.dev.message, null, 'debe existir mensaje del dev')
  t.is(result.dev.approval, null, 'debe existir aprovacion del dev')

  let contrib2 = contrib
  delete contrib2['title']
  let resultTwo = await t.throws(db.createContrib(contrib2, username))
  t.deepEqual(resultTwo.message, 'Invalid contribution')
})

test('delete a contribution', async t => {
  let db = t.context.db
  t.is(typeof db.deleteContrib, 'function', 'createContrib should be')

  // debe crearse un usuario para evaluar
  let user = fixtures.getUser()
  let createdUser = await db.createUser()
  let username = createdUser.username

  // debe crearse un contribucion
  let contrib = fixtures.getContrib()
  let createdContrib = await db.createContrib(contrib, username)

  // Debe reconocer si el usuario es dueño de la contribución
  // debe intentar eliminar una contribucion -
  // enviando la informacion con el id de la contribución y el usuario
  // debe leer si no esta en evaluacion o aprobado por el dev, en ese caso puede eliminarse
  // Si se puede, debe devolver el mensaje de eliminado con exito, con el id, y el titulo
})

test.todo('modify a contribution')
test.todo('rate contribution')
test.todo('active a evaluate mode for a contribution')
test.todo('add a message to a contribution')
test.todo('add dev response')

// utils
test.todo('get a contribution')
test.todo('get last ten contributions')
