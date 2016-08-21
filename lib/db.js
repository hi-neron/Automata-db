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
      return Promise.reject(new Error('not connected'))
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

  getUser (username, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not connected'))
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
        return Promise.resolve(new Error(`user name ${username} not found ${e}`))
      }

      return Promise.resolve(usr)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  editMasteries (username, masteries, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected'))
    }

    let connection = this.connection
    let db = this.db

    let getUser = this.getUser.bind(this)

    const tasks = co.wrap(function * () {
      let conn = yield connection

      let userDb = yield getUser(username)

      if (!userDb) {
        return Promise.reject(new Error(`user ${username} not found`))
      }

      yield r.db(db).table('users').get(userDb.id).update({
        masteries: masteries
      }).run(conn)

      let user = yield getUser(userDb.username)

      return Promise.resolve(user)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  getByMasteries (mastery, cb) {
    if (!this.connected) {
      return Promise.rejec(new Error('Not connected'))
    }

    // let db = this.db
    // let connection = this.connection

    const tasks = co.wrap(function * () {
      // let conn = yield connection
      return Promise.resolve(['uno'])
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }
}

module.exports = Database
