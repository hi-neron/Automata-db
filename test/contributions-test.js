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

// contributions methods
test('Get a contrib', async t => {
  let db = t.context.db
  t.is(typeof db.getContrib, 'function', 'createContrib should be')

  // debe crearse un usuario para evaluar
  let user = fixtures.getUser()
  let createdUser = await db.createUser(user)
  let username = createdUser.username

  // debe crearse un contribucion
  let contrib = fixtures.getContrib()
  let createdContrib = await db.createContrib(contrib, username)

  // debe obtenerse una contribucion
  let receivedContrib = await db.getContrib(createdContrib.publicId)
  t.is(receivedContrib.title, createdContrib.title, 'should be same title')
  t.is(receivedContrib.publicId, createdContrib.publicId, 'should be same publicId')
  t.deepEqual(receivedContrib.user, createdContrib.user, 'should be same user')

  // debe devolver un error cuando no existe el contribId
  let contribIdBad = '2r2f2f23f'
  let receivedContrib2 = await t.throws(db.getContrib(contribIdBad))
  t.is(receivedContrib2.message, `contrib not found`)
})

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
  let createdUser = await db.createUser(user)
  let username = createdUser.username

  // debe crearse un contribucion
  let contrib = fixtures.getContrib()
  let contrib2 = fixtures.getContrib()
  let createdContrib = await db.createContrib(contrib, username)

  // debe intentar eliminar una contribucion
  let contribId = createdContrib.publicId
  let deleteResponse = await db.deleteContrib(contribId, username)

  // Si se puede, debe devolver el mensaje de eliminado con exito, con el id, y el titulo
  // enviando la informacion con el id de la contribución y el usuario
  t.deepEqual(deleteResponse.message, 'deleted successfully', 'debe ser eliminada')
  t.is(deleteResponse.publicId, contribId)

  // Debe reconocer si el usuario es dueño de la contribución
  let secondUser = fixtures.getUser()
  let createdSecondUser = await db.createUser(secondUser)

  createdContrib = await db.createContrib(contrib2, username)
  contribId = createdContrib.publicId

  username = createdSecondUser.username

  let badDeleteResponse = await t.throws(db.deleteContrib(contribId, username))
  t.regex(badDeleteResponse.message, /are not authorized/, 'devuleve un error si no coincide user con contribución')

  // debe leer si no esta en evaluacion o aprobado por el dev, en ese caso puede eliminarse
  let contrib3 = fixtures.getContrib()

  // se crea la contribucion
  createdContrib = await db.createContrib(contrib3, username)
  contribId = createdContrib.publicId

  // se debe crear un user dev para dar aprovacion
  let userDev = fixtures.getUser()
  userDev.username = 'pepe'
  let devCreated = await db.createUser(userDev)

  // se debe crear una respuesta positiva del dev
  let devRes = fixtures.getDevData(true)

  // user dev debe aprovar la contribucion
  await db.devRes(contribId, devCreated, devRes)

  // debe devolver un error si fue aprovado por el dev
  let delResponseErr = await t.throws(db.deleteContrib(contribId, username))
  t.regex(delResponseErr.message, /aprovated can't be deleted/, 'Contributions aproved can\'t be deleted')
})

// contributions edit methods
test('rate contribution', async t => {
  let db = t.context.db
  t.is(typeof db.rateContrib, 'function', 'rateContrib should be exist')

  // Crear un usuario para crear una contribucio
  let newUser = fixtures.getUser()
  let createdUser = await db.createUser(newUser)
  let userName = createdUser.username

  let newUser2 = fixtures.getUser()
  let createdUser2 = await db.createUser(newUser2)
  let userName2 = createdUser2.username

  // se crea una contribucion
  let newContrib = fixtures.getContrib()
  let createdContrib = await db.createContrib(newContrib, userName)
  let contribId = createdContrib.publicId

  // se debe puntear la contribución
  let response = await db.rateContrib(contribId, userName)
  let puntaje = response.rate

  t.is(response.status, 200, 'debe llegar un estatus ok')
  t.is(puntaje, 1, 'Debe llegar la cantidad total del puntaje')

  // se debe sumar la puntuación
  response = await db.rateContrib(contribId, userName2)
  t.is(response.status, 200, 'debe llegar un estatus ok')
  t.deepEqual(response.rate, 2, 'Debe llegar la cantidad total del puntaje')

  // se debe puntear la contribucion de nuevo y recibir una respuesta de reduccion del contador
  let response1 = await db.rateContrib(contribId, userName)
  t.is(response1.status, 200, 'debe llegar un estatus ok')
  t.deepEqual(response1.rate, puntaje, 'Debe llegar la cantidad total del puntaje, que reduce en uno')

  // se debe recibir un error si la contribucion no existe
  let response2 = await t.throws(db.rateContrib(2312314, userName))
  t.regex(response2.message, /contrib not found/, 'usuario invalido')

  // de debe recibir un error si el usuario no existe
  let response3 = await t.throws(db.rateContrib(contribId, fixtures.getUser().username))
  t.regex(response3.message, /not found/, 'usuario invalido')
})

test('modify a contribution', async t => {
  let db = t.context.db
  t.is(typeof db.editContrib, 'function', 'editContrib should be exist')

  // Crear un usuario para crear una contribucion
  let newUser = fixtures.getUser()
  let createdUser = await db.createUser(newUser)
  let userName = createdUser.username

  // se crea una contribucion
  let newContrib = fixtures.getContrib()
  let createdContrib = await db.createContrib(newContrib, userName)
  let contribId = createdContrib.publicId

  let changes = {
    type: 'feature',
    info: 'this data going to change',
    image: 'http://anyoneimage.png'
  }

  // se debe editar una contribucion
  let response = await db.editContrib(contribId, userName, changes)

  // los cambios deben incluir cualquiera de los datos necesarios
  // type, info or image. esa data se remplaza por la original
  t.is(response.status, 200, 'Status 200')
  t.deepEqual(response.changes, changes, 'changes should be made')

  // se debe recibir un error si la contribucion no existe
  let response2 = await t.throws(db.rateContrib(2312314, userName, changes))
  t.regex(response2.message, /contrib not found/, 'usuario invalido')

  // de debe recibir un error si el usuario no existe
  let response3 = await t.throws(db.rateContrib(contribId, fixtures.getUser().username, changes))
  t.regex(response3.message, /not found/, 'usuario invalido')

  // de debe recibir un error si la data no cumple al menos un requisito
  let badChanges = {}
  let response4 = await t.throws(db.rateContrib(contribId, fixtures.getUser().username, badChanges))
  t.regex(response4.message, /not found/, 'usuario invalido')
})

// dev methods
test('create dev user', async t => {
  let db = t.context.db
  t.is(typeof db.deleteContrib, 'function', 'createContrib should be')

  // debe crearse un usuario para evaluar, el usuario debe ser el admin
  let user = fixtures.getUser()
  user.username = 'pepe'
  let createdUser = await db.createUser(user)

  // let username = createdUser.username
  t.is(createdUser.admin, true, 'must be administrator')

  // se asegura de que ningun otro usuario sea dev
  let userNoAdmin = fixtures.getUser()
  user.username = 'michael'
  let createdUserNoA = await db.createUser(userNoAdmin)

  // let username = createdUser.username
  t.is(createdUserNoA.admin, false, 'must be administrator')
})

test('add dev response', async t => {
  let db = t.context.db
  t.is(typeof db.devRes, 'function', 'devResponse should exist')

  // se debe crear un usario
  let newUser = fixtures.getUser()

  // se debe darle el titulo de developer.

  // la forma como se gestiona al usuario *dev* es:
  // solo se puede asignar a un usuario el rol de dev desde la creacion del usuario, nunca despues
  // Se busca en una variable de entorno, que contiene los nombres de los nuevos devs
  // si el nombre coincide con el nuevo usuario, este tendra ese rol.

  // en este caso pepe, esta en la lista de devs users
  newUser.username = 'pepe'
  let createdUser = await db.createUser(newUser)
  let userName = createdUser.username

  // Se asegura de que el rol sea dev
  t.true(createdUser.admin, 'debe ser admin')

  // se debe crear una contribución
  let newContrib = fixtures.getContrib()
  let createdContrib = await db.createContrib(newContrib, userName)
  let contribId = createdContrib.publicId

  // se crea un dev message
  let devMessage = fixtures.getDevData()

  // se debe valorar la contribucion por el dev
  let response = await db.devRes(contribId, createdUser, devMessage)
  t.is(response.message, devMessage.message, 'message shoud be the same')
  t.deepEqual(response.status, 200, 'status shoud be 200')

  // se debe evitar que un user normal modifique el devResponse
  let userNormal = fixtures.getUser()
  let createdNormalUser = await db.createUser(userNormal)
  t.false(createdNormalUser.admin, 'User not should be admin')

  // la repsuesta debe ser un error de auth
  let fakeResponse = await t.throws(db.devRes(contribId, createdNormalUser, devMessage))
  t.regex(fakeResponse.message, /not authorized/, 'Message should be an error')
})

// contributions messages
test('add crontib message', async t => {
  // la funcion agregar un mensaje debe existir
  let db = t.context.db
  t.is(typeof db.addContribMessage, 'function', 'addContribMessage should be exist')

  // primero se crea un usuario, para crear la contribucion
  let newUser = fixtures.getUser()
  let createdUser = await db.createUser(newUser)
  let userName = createdUser.username

  // se crea una contribucion
  let newContrib = fixtures.getContrib()
  let createdContrib = await db.createContrib(newContrib, userName)
  let contribId = createdContrib.publicId

  // se crea un mensaje
  let message = 'this is my message'

  // se anexa un mensaje a la contribucion
  let response = await db.addContribMessage(contribId, userName, message)
  t.is(response.info, message, 'should be the same message')
  t.is(response.status, 200, 'should be the same message')
  t.true(response.date instanceof Date, 'It should have a date')
  t.is(typeof response.id, 'string', 'should be have an id')
  t.is(typeof response.user, 'object', 'should be have a place')

  // se debe recibir un error si la contribucion no existe
  let response2 = await t.throws(db.addContribMessage(2312314, userName, message))
  t.regex(response2.message, /contrib not found/, 'usuario invalido')

  // de debe recibir un error si el usuario no existe
  let response3 = await t.throws(db.rateContrib(contribId, fixtures.getUser().username, message))
  t.regex(response3.message, /not found/, 'usuario invalido')
})

test('Del crontib message', async t => {
  // la funcion eliminar un mensaje debe existir
  let db = t.context.db
  t.is(typeof db.editContrib, 'function', 'delContribMessage should be exist')
})

// contributios utils
test.todo('get last ten contributions')
