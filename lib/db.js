'use strict'

const Promise = require('bluebird')
const co = require('co')
const r = require('rethinkdb')
const utils = require('./utils')
const uuid = require('uuid-base62')

const defaults = {
  port: 28015,
  host: 'localhost',
  db: 'AutomataDb'
}

class Database {
  constructor (config) {
    config = config || {}
    this.port = config.port || defaults.port
    this.host = config.host || defaults.host
    this.db = config.db || defaults.db
  }

  connect (cb) {
    this.connection = r.connect({
      'host': this.host,
      'port': this.port
    })

    this.connected = true

    let db = this.db
    let connection = this.connection

    const setup = co.wrap(function * () {
      let conn = yield connection

      let dbList = yield r.dbList().run(conn)

      if (dbList.indexOf(db) === -1) {
        yield r.dbCreate(db).run(conn)
      }

      let dbTables = yield r.db(db).tableList().run(conn)

      if (dbTables.indexOf('users') === -1) {
        yield r.db(db).tableCreate('users').run(conn)
        yield r.db(db).table('users').indexCreate('username').run(conn)
        yield r.db(db).table('users').indexCreate('masteries').run(conn)
      }

      if (dbTables.indexOf('images') === -1) {
        yield r.db(db).tableCreate('images').run(conn)
      }

      if (dbTables.indexOf('grid') === -1) {
        yield r.db(db).tableCreate('grid').run(conn)
      }

      return conn
    })

    return Promise.resolve(setup()).asCallback(cb)
  }

  disconnect () {
    if (!this.connected) {
      return Promise.resolve(new Error('not Connected'))
    }

    this.connected = false
    return Promise.resolve(this.connection).then((conn) => {
      conn.close()
    })
  }

  createUser (user, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(cb)
    }

    let db = this.db
    let connection = this.connection

    const tasks = co.wrap(function * () {
      let conn = yield connection

      if (!user.facebook) {
        user.password = utils.encrypt(user.password)
      }

      user.createdAt = new Date()
      user.avatar = '/standard.png'
      user.skills = []
      user.masteries = []
      user.points = 0
      user.alerts = []
      user.messages = []

      let result = yield r.db(db).table('users').insert(user).run(conn)

      if (result.errors > 0) {
        return Promise.reject(new Error(result.first_error))
      }

      user.id = result.generated_keys[0]

      yield r.db(db).table('users').get(user.id).update({
        public_id: uuid.encode(user.id)
      }).run(conn)

      let created = yield r.db(db).table('users').get(user.id).run(conn)
      return Promise.resolve(created)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  getUser (username, size, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not connected')).asCallback(cb)
    }

    let db = this.db
    let connection = this.connection

    const tasks = co.wrap(function * () {
      let conn = yield connection

      yield r.db(db).table('users').indexWait().run(conn)

      let users = yield r.db(db).table('users').getAll(username, {
        index: 'username'
      }).run(conn)

      let usr = null

      try {
        usr = yield users.next()
      } catch (e) {
        return Promise.reject(new Error(`the user: ${username} not found`))
      }

      if (size !== 'm') {
        delete usr.messages
      }

      if (size !== 'a') {
        delete usr.alerts
      }

      return Promise.resolve(usr)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  editMasteries (username, masteries, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(cb)
    }

    if (typeof masteries !== 'object') {
      let masteriesList = []
      masteriesList.push(masteries)
      masteries = masteriesList
    }

    let connection = this.connection
    let db = this.db

    let getUser = this.getUser.bind(this)
    let normalizedMasteries = masteries.map(utils.lowerCase)

    const tasks = co.wrap(function * () {
      let conn = yield connection

      let userDb = yield getUser(username)

      if (userDb.error) {
        return Promise.reject(userDb)
      }

      yield r.db(db).table('users').get(userDb.id).update({
        masteries: normalizedMasteries
      }).run(conn)

      let user = yield getUser(userDb.username)

      return Promise.resolve(user)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  getUsersByMastery (mastery, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not connected')).asCallback(cb)
    }

    let db = this.db
    let connection = this.connection
    mastery = utils.lowerCase(mastery)

    const tasks = co.wrap(function * () {
      let conn = yield connection

      yield r.db(db).table('users').indexWait().run(conn)

      let users = yield r.db(db).table('users').filter((user) => {
        return user('masteries').contains(mastery)
      }).orderBy(r.desc('username')).run(conn)

      let result = yield users.toArray()

      return Promise.resolve(result)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  addAvatar (username, avatar, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not connected')).asCallback(cb)
    }

    let connection = this.connection
    let db = this.db

    let getUser = this.getUser.bind(this)

    let tasks = co.wrap(function* () {
      let conn = yield connection

      let userDb = yield getUser(username)

      if (userDb.error) {
        return Promise.reject(userDb)
      }

      yield r.db(db).table('users').get(userDb.id).update({
        avatar: avatar
      }).run(conn)

      let user = yield getUser(userDb.username)

      return Promise.resolve(user)
    })
    return Promise.resolve(tasks()).asCallback(cb)
  }

  addMessage (username, message, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not connected'))
    }

    let db = this.db
    let connection = this.connection

    let getUser = this.getUser.bind(this)

    let tasks = co.wrap(function * () {
      let conn = yield connection

      let userDb = yield getUser(username, 'm')

      if (userDb.error) {
        return Promise.reject(userDb)
      }

      if (!utils.validateMessage(message)) {
        return Promise.reject(new Error('invalid Message '))
      }

      let emisor = yield getUser(message.from)

      if (emisor.error) {
        return Promise.reject(new Error('invalid : emisor user not found'))
      }

      let emisorInfo = {
        name: emisor.name,
        avatar: emisor.avatar,
        masteries: emisor.masteries,
        username: emisor.username
      }

      message.date = new Date()
      message.from = emisorInfo
      message.id = uuid.v4()
      message.subject = message.subject || ''

      let messages = userDb.messages
      messages.push(message)

      yield r.db(db).table('users').get(userDb.id).update({
        messages: messages
      }).run(conn)

      let userMessages = yield getUser(username, 'm')

      return Promise.resolve(userMessages)
    })
    return Promise.resolve(tasks()).asCallback(cb)
  }

  addAlert (username, alert, cb) {}
  getCommunications () {}
}

module.exports = Database
