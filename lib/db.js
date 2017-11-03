'use strict'

const Promise = require('bluebird')
const co = require('co')
const r = require('rethinkdb')
const utils = require('./utils')
const uuid = require('uuid-base62')
const Moment = require('moment')
const _ = require('lodash')

const defaults = {
  port: 28015,
  host: 'localhost',
  db: 'automata'
}

const laBete = {
  avatar: '/img/default-bete.png',
  badges: 'all',
  masteries: 'Les mains de la bête',
  level: 'all',
  username: 'La Bête',
  title: 'le bête',
  byAdmin: 'Chuck Norris',
  dateAdded: 0,
  genre: 'male'
}

class Database {
  constructor (config) {
    config = config || {}
    this.port = config.port || defaults.port
    this.host = config.host || defaults.host
    this.db = config.db || defaults.db
    this.setup = config.setup || false
  }

  connect (cb) {
    this.connection = r.connect({
      'host': this.host,
      'port': this.port
    })

    this.connected = true

    let db = this.db
    let connection = this.connection

    if (!this.setup) {
      return Promise.resolve(connection).asCallback(cb)
    }

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
        yield r.db(db).table('images').indexCreate('createdAt').run(conn)
        yield r.db(db).table('images').indexCreate('userId', {multi: true}).run(conn)
        yield r.db(db).table('images').indexCreate('name', {multi: true}).run(conn)
      }

      if (dbTables.indexOf('grid') === -1) {
        yield r.db(db).tableCreate('grid').run(conn)
        yield r.db(db).table('grid').indexCreate('date').run(conn)
      }

      if (dbTables.indexOf('contributions') === -1) {
        yield r.db(db).tableCreate('contributions').run(conn)
        yield r.db(db).table('contributions').indexCreate('dateAdded').run(conn)
        yield r.db(db).table('contributions').indexCreate('tags', {multi: true}).run(conn)
        yield r.db(db).table('contributions').indexCreate('title').run(conn)
        yield r.db(db).table('contributions').indexCreate('onProcess').run(conn)
      }

      if (dbTables.indexOf('mom') === -1) {
        yield r.db(db).tableCreate('mom').run(conn)
        yield r.db(db).table('mom').indexCreate('dateAdded').run(conn)
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

  // Generate grid file
  updateGrid (data, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not connected')).asCallback(cb)
    }

    let db = this.db
    let connection = this.connection

    const tasks = co.wrap(function * () {
      let conn = yield connection

      let grid = data.grid

      // template grid
      let newGrid = {
        grid: grid,
        date: new Date()
      }

      let result = yield r.db(db).table('grid').insert(newGrid).run(conn)

      if (result.errors > 0) {
        return Promise.reject(new Error(result.first_error))
      }

      grid.id = result.generated_keys[0]

      yield r.db(db).table('grid').get(grid.id).update({
        publicId: uuid.encode(grid.id)
      }).run(conn)

      let gridUpdated = yield r.db(db).table('grid').get(grid.id).run(conn)

      return Promise.resolve(gridUpdated)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  getGrid (cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not connected')).asCallback(cb)
    }

    let db = this.db
    let connection = this.connection

    const tasks = co.wrap(function * () {
      let conn = yield connection

      // buscar la grid por fecha y entregar la mas actualizada
      // cargar los indices
      yield r.db(db).table('grid').indexWait().run(conn)

      // buscar por el indice date, la fecha mas cercana
      let result = yield r.db(db).table('grid').orderBy({
        index: r.desc('date')
      }).run(conn)

      let grid = yield result.toArray()

      return Promise.resolve(grid)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  // Servicio de usuarios
  getUser (username, size, cb) {
    if (!this.connected) {
      return Promise.reject(new Error(`Not connected ${username}`)).asCallback(cb)
    }

    let db = this.db
    let connection = this.connection

    // el usuario debe ser una cadena de texto.
    if (!username || username === '' || typeof username !== 'string') {
      return Promise.reject(new Error('User name invalid, must have user, that user need have a string type username'))
    }

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

      // el tamanio de la respuesta...
      // ma, completa
      // m sin mensajes
      // a sin alertas
      if (size === 'ma') {
        return Promise.resolve(usr)
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

  createUser (user, cb) {
    /** user info
    createdAt
    avatar
    masteries

    // Scores & prizes
    alignment
    skills
    points
    badges
    level
    // Comunications
    alerts
    messages
    // helpers
    images
    */

    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(cb)
    }

    let db = this.db
    let connection = this.connection

    let getUser = this.getUser.bind(this)
    if (!user) {
      return Promise.reject(new Error('Invalid new user')).asCallback(cb)
    }

    const tasks = co.wrap(function * () {
      let conn = yield connection
      let continues = false

      try {
        yield getUser(user.username)
      } catch (err) {
        continues = true
      }

      if (!continues) {
        return Promise.reject(new Error({message: `the username: ${user.username} already exists`}))
      }

      if (!user.facebook) {
        user.password = utils.encrypt(user.password)
      }

      // user data
      user.createdAt = new Date()
      user.avatar = user.avatar || '/standard.png'
      user.masteries = user.masteries || ['Walker']
      user.memory = user.memory || 'none'
      user.genre = user.genre || 'male'

      // Scores & prizes
      user.skills = user.skills || []
      user.points = 0
      user.badges = []
      user.level = 0
      user.title = 'CUERNITO MACHÉ'

      // generate an admin user
      user.admin = false

      let admins = process.env.MALIN_NAMES

      admins = admins === undefined ? [] : admins.split(',')

      if (admins.includes(user.username) || user.username === 'pepe') {
        user.admin = true
        user.title = 'Dev ⛑'
      }

      // Comunications
      user.alerts = []
      user.messages = []

      // helpers
      user.images = 0

      let result = yield r.db(db).table('users').insert(user).run(conn)

      if (result.errors > 0) {
        return Promise.reject(new Error(result.first_error))
      }

      user.id = result.generated_keys[0]

      yield r.db(db).table('users').get(user.id).update({
        publicId: uuid.encode(user.id)
      }).run(conn)

      let created = yield r.db(db).table('users').get(user.id).run(conn)
      return Promise.resolve(created)
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

    if (masteries.length > 3) {
      masteries = _.take(masteries, 3)
    }

    let getUser = this.getUser.bind(this)
    let normalizedMasteries = masteries.map(utils.lowerCase)

    for (let i = 0; i < normalizedMasteries.length; i++) {
      if (!utils.isMastery(normalizedMasteries[i])) {
        return Promise.reject(new Error('Mastery not found')).asCallback(cb)
      }
    }

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

      delete user.password
      delete user.email

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

      delete user.password
      delete user.email

      return Promise.resolve(user)
    })
    return Promise.resolve(tasks()).asCallback(cb)
  }

  // Modulo de comunicaciones
  addMessage (username, message, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not connected')).asCallback(cb)
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

  addAlert (username, alert, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(cb)
    }
    let db = this.db
    let connection = this.connection
    let getUser = this.getUser.bind(this)

    let tasks = co.wrap(function* () {
      let conn = yield connection

      let userDb = yield getUser(username, 'a')

      if (userDb.error) {
        return Promise.reject(userDb)
      }

      if (!utils.validateAlert(alert)) {
        return Promise.reject(new Error('invalid Alert'))
      }

      let emisorInfo = {}

      try {
        let emisor = yield getUser(alert.from)
        emisorInfo = {
          name: emisor.name,
          avatar: emisor.avatar,
          masteries: emisor.masteries,
          username: emisor.username
        }
      } catch (e) {
        emisorInfo = {
          name: 'Automata',
          avatar: 'automata-avatar.jpg',
          masteries: 'automata chaman',
          username: 'automata-super'
        }
      }

      alert.date = new Date()
      alert.from = emisorInfo
      alert.id = uuid.v4()

      let alerts = userDb.alerts
      alerts.push(alert)

      yield r.db(db).table('users').get(userDb.id).update({
        alerts: alerts
      }).run(conn)

      let userAlerts = yield getUser(username, 'a')

      return Promise.resolve(userAlerts)
    })
    return Promise.resolve(tasks())
  }

  getCommunications (username, cb) {
    if (!this.connected) {
      return Promise.resolve(new Error('Not connected')).asCallback(cb)
    }

    let getUser = this.getUser.bind(this)

    let tasks = co.wrap(function * () {
      let userDb = yield getUser(username, 'ma')

      if (userDb.error) {
        return Promise.reject(userDb)
      }

      let communications = _.orderBy(_.union(userDb.messages, userDb.alerts), ['date'], ['asc'])
      userDb.communications = communications

      delete userDb.alerts
      delete userDb.messages

      return Promise.resolve(userDb)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  // Modulo de puntajes
  addPoints (username, points, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not connected')).asCallback(cb)
    }

    let connection = this.connection
    let db = this.db
    if (!points) points = 1

    let getUser = this.getUser.bind(this)

    let tasks = co.wrap(function* () {
      let conn = yield connection

      let userDb = yield getUser(username)

      if (userDb.error) {
        return Promise.reject(userDb)
      }

      points = userDb.points + points

      yield r.db(db).table('users').get(userDb.id).update({
        points: points
      }).run(conn)

      let user = yield getUser(userDb.username)

      return Promise.resolve(user.points)
    })
    return Promise.resolve(tasks()).asCallback(cb)
  }

  // Modulo de Imagenes
  addImage (username, cb) {
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

      let images = userDb.images + 1

      yield r.db(db).table('users').get(userDb.id).update({
        images: images
      }).run(conn)

      let user = yield getUser(userDb.username)

      return Promise.resolve(user.images)
    })
    return Promise.resolve(tasks()).asCallback(cb)
  }

  reduceUserImages (username, cb) {
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

      let images = userDb.images - 1

      if (images < 0) {
        return Promise.reject(new Error('You do not have more images'))
      }

      yield r.db(db).table('users').get(userDb.id).update({
        images: images
      }).run(conn)

      let user = yield getUser(userDb.username)

      return Promise.resolve(user.images)
    })
    return Promise.resolve(tasks()).asCallback(cb)
  }

  addLevel (username, cb) {
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

      let level = userDb.level + 1

      yield r.db(db).table('users').get(userDb.id).update({
        level: level
      }).run(conn)

      let user = yield getUser(userDb.username)

      return Promise.resolve(user.level)
    })
    return Promise.resolve(tasks()).asCallback(cb)
  }

  addBadge (username, badge, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not connected')).asCallback(cb)
    }

    if (!badge) {
      return Promise.reject(new Error('badge invalid'))
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

      if (!utils.findBadge(badge)) {
        return Promise.reject(new Error('invalid badge'))
      }

      let newBadge = {
        name: badge,
        date: new Date()
      }

      let badges = userDb.badges
      badges.push(newBadge)

      yield r.db(db).table('users').get(userDb.id).update({
        badges: badges
      }).run(conn)

      let user = yield getUser(userDb.username)

      return Promise.resolve(user.badges)
    })
    return Promise.resolve(tasks()).asCallback(cb)
  }

  addSkill (username, skill, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not connected')).asCallback(cb)
    }

    if (!skill) {
      return Promise.reject(new Error('skill invalid'))
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

      let skills = userDb.skills
      skills.push(skill)

      yield r.db(db).table('users').get(userDb.id).update({
        skills: skills
      }).run(conn)

      let user = yield getUser(userDb.username)

      return Promise.resolve(user.skills)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  // CONTRIBUTIONS

  // Contributions utilities
  getContrib (contributionId, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not Connected')).asCallback(cb)
    }

    let db = this.db
    let connection = this.connection

    try {
      contributionId = uuid.decode(contributionId)
    } catch (e) {
      return Promise.reject(new Error(e))
    }

    let tasks = co.wrap(function * () {
      let conn = yield connection

      yield r.db(db).table('contributions').indexWait().run(conn)
      let contribDb = yield r.db(db).table('contributions').get(contributionId).run(conn)

      if (!contribDb) {
        return Promise.reject(new Error(`contrib not found`))
      }

      return Promise.resolve(contribDb)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  getTenContribs (lastT, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not Connected')).asCallback(cb)
    }

    let db = this.db
    let connection = this.connection

    // lastT devuleve los ultimos
    lastT = lastT || 0

    let tasks = co.wrap(function * () {
      let conn = yield connection

      // definir el multiplicador
      // let n = 10
      // let start = n * lastT
      // let end = start + n

      // buscar el rango
      yield r.db(db).table('contributions').indexWait().run(conn)
      let result = yield r.db(db).table('contributions').orderBy({
        index: r.desc('dateAdded')
      }).run(conn)

      let contributions = yield result.toArray()

      let res = {
        status: 200,
        contributions: contributions
      }

      return Promise.resolve(res)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  getContribsByTag (tag, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not Connected')).asCallback(cb)
    }

    let db = this.db
    let connection = this.connection

    let tasks = co.wrap(function * () {
      let conn = yield connection

      let tagToSearch = '#' + tag

      console.log(tagToSearch)

      yield r.db(db).table('contributions').indexWait().run(conn)
      let contribsDb = yield r.db(db).table('contributions').getAll(tagToSearch, {index: 'tags'}).run(conn)
      let response

      try {
        response = yield contribsDb.toArray()
      } catch (e) {
        return Promise.reject(e)
      }

      return Promise.resolve(response)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  // Contribs functions
  createContrib (contribution, username, cb) {
    /*
      contrib {
        id: uuid
        title: 'title'
        dateAdded: date
        user: {
          userId,
          userName,
          userTitle
          userAvatar
        },
        tags: arrays
        data: {
          type: 'message|image|feature',
          data: string,
          image: url
        }
        messages: [
          {
            dateAdded: date
            Message: string
            user {
              avatar: String
              userName: String
            }
          }
        ]
        comunityRate: ['nombre']
        dev {
          Message: string
          Approval: boolean
        }
      }
    */

    if (!this.connected) {
      return Promise.reject(new Error('not connected'))
    }

    if (!contribution.title || !contribution.info) {
      return Promise.reject(new Error('La informacion, o el titulo de la contribución no son validos'))
    }

    let db = this.db
    let connection = this.connection

    let getUser = this.getUser.bind(this)

    let tasks = co.wrap(function * () {
      let conn = yield connection

      let userDb = yield getUser(username)

      if (!userDb) {
        return Promise.reject(new Error('user not found'))
      }

      let user = userDb

      let newContribution = {}
      // date create
      newContribution.dateAdded = new Date()

      // user data
      newContribution.user = {
        'publicId': user.publicId,
        'title': user.title,
        'avatar': user.avatar,
        'username': user.username
      }

      newContribution.title = contribution.title
      delete contribution.title

      newContribution.data = contribution
      // newContribution.data.type = contribution.type || 'message'

      // Community
      newContribution.messages = []
      newContribution.rate = []
      newContribution.inProcess = false

      // Dev
      newContribution.dev = {
        'message': null,
        'approval': null
      }

      // getting tags
      let message = contribution.info

      let tags = utils.getTags(message)

      newContribution.tags = tags

      let result = yield r.db(db).table('contributions').insert(newContribution).run(conn)

      if (result.errors > 0) {
        return Promise.reject(new Error(result.first_error))
      }

      try {
        contribution.id = result.generated_keys[0]
      } catch (error) {
        return Promise.reject(new Error(`error: ${error}`))
      }

      yield r.db(db).table('contributions').get(contribution.id).update({
        publicId: uuid.encode(contribution.id)
      }).run(conn)

      let contributionCreated = yield r.db(db).table('contributions').get(contribution.id).run(conn)
      return Promise.resolve(contributionCreated)
    })
    return Promise.resolve(tasks()).asCallback(cb)
  }

  deleteContrib (contributionId, username, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected'))
    }

    let db = this.db
    let connection = this.connection

    let getUser = this.getUser.bind(this)
    let getContribution = this.getContrib.bind(this)

    let tasks = co.wrap(function * () {
      let conn = yield connection
      let userDb = yield getUser(username)

      if (!userDb) {
        return Promise.reject(new Error('user not found'))
      }

      // busca la contribucion
      let contribDb = yield getContribution(contributionId)
      if (!contribDb) {
        return Promise.reject(new Error('contribution not found'))
      }

      // Debe ser el dueño de la contribucion para poder eliminarla
      if (contribDb.user.username !== userDb.username) {
        return Promise.reject(new Error('You are not authorized'))
      }

      // las contribuciones aprobadas no se  pueden eliminar
      if (contribDb.dev.approval) {
        return Promise.reject(new Error('Contributions aprovated can\'t be deleted'))
      }

      let id = contribDb.id

      let response = yield r.db(db).table('contributions').get(id).delete().run(conn)

      if (!response.deleted) {
        return Promise.reject(new Error(`Contribution ${contributionId} not found`))
      }

      let publicId = contribDb.publicId

      let res = {
        status: 200,
        message: 'deleted successfully',
        publicId: publicId
      }

      return Promise.resolve(res)
    })
    return Promise.resolve(tasks()).asCallback(cb)
  }

  rateContrib (contributionId, scoringUsername, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected'))
    }

    let db = this.db
    let connection = this.connection

    if (!scoringUsername) {
      return Promise.reject(new Error('Invalid new user')).asCallback(cb)
    }

    if (!contributionId) {
      return Promise.reject(new Error('Invalid new user')).asCallback(cb)
    }

    let getUser = this.getUser.bind(this)
    let getContribution = this.getContrib.bind(this)

    let tasks = co.wrap(function * () {
      let conn = yield connection

      // se necesita saber si el usuario existe
      let userDb = yield getUser(scoringUsername)

      // devuelve un error si no
      if (!userDb) {
        return Promise.reject(new Error('user not found'))
      }

      // Se necesita buscar la contribucion
      let dbContrib = yield getContribution(contributionId)

      // devuelve un error si no existe
      if (!dbContrib) {
        return Promise.reject(new Error('contribution not found'))
      }

      let usersAgree = dbContrib.rate

      // se busca si el usuario ya esta en la lista de rates de la contribucion
      if (usersAgree.includes(userDb.username)) {
        // si esta, lo elimina
        usersAgree = _.remove(usersAgree, (n) => {
          return n !== userDb.username
        })
      } else {
        // si no esta lo agrega
        usersAgree.push(userDb.username)
      }

      // se debe actualizar en la bd
      yield r.db(db).table('contributions').get(dbContrib.id).update({
        rate: usersAgree
      }).run(conn)

      let dbContribActualized = yield getContribution(contributionId)

      // se debe construir la respuesta
      let rate = dbContribActualized.rate

      let res = {
        status: 200,
        rate: rate,
        message: 'ok'
      }

      // se da una respuesta
      return Promise.resolve(res)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  editContrib (contributionId, username, changes, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected'))
    }

    let db = this.db
    let connection = this.connection

    if (!username) {
      return Promise.reject(new Error('Invalid new user')).asCallback(cb)
    }

    if (!contributionId) {
      return Promise.reject(new Error('Invalid new user')).asCallback(cb)
    }

    // se asegura de que se pueda hacer algun cambio antes de llamar a la bd
    const ChangesProps = ['type', 'info', 'image']
    let count = 0

    for (var prop in changes) {
      if (_.indexOf(ChangesProps, prop) >= 0) count++
    }

    if (count === 0) {
      return Promise.reject(new Error('invalid changes')).asCallback(cb)
    }

    let getUser = this.getUser.bind(this)
    let getContribution = this.getContrib.bind(this)

    let tasks = co.wrap(function * () {
      let conn = yield connection

      // se necesita saber si el usuario existe
      let dbUser = yield getUser(username)

      // devuelve un error si no existe
      if (!dbUser) {
        return Promise.reject(new Error('user not found'))
      }

      // Se necesita buscar la contribucion
      let dbContrib = yield getContribution(contributionId)

      // devuelve un error si no existe
      if (!dbContrib) {
        return Promise.reject(new Error('contribution not found'))
      }

      if (changes.type === '') delete changes.type
      if (changes.info === '') delete changes.info
      if (changes.image === '') delete changes.image

      // se hacen los cambios
      changes.type = changes.type || dbContrib.data.type
      changes.info = changes.info || dbContrib.data.info
      changes.image = changes.image || dbContrib.data.image

      // se debe actualizar en la bd
      yield r.db(db).table('contributions').get(dbContrib.id).update({
        data: changes
      }).run(conn)

      let dbContribActualized = yield getContribution(contributionId)

      let res = {
        status: 200,
        changes: dbContribActualized.data
      }

      // se da una respuesta
      return Promise.resolve(res)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  addContribMessage (contributionId, username, content, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not Connected'))
    }

    if (!username) {
      return Promise.reject(new Error('Invalid new user')).asCallback(cb)
    }

    if (!contributionId) {
      return Promise.reject(new Error('Invalid contribution ID')).asCallback(cb)
    }

    if (!content || content.length === 0) {
      return Promise.reject(new Error('Invalid message')).asCallback(cb)
    }

    let db = this.db
    let connection = this.connection

    let getUser = this.getUser.bind(this)
    let getContribution = this.getContrib.bind(this)

    let tasks = co.wrap(function * () {
      let conn = yield connection

      // se necesita saber si el usuario existe
      let dbUser = yield getUser(username)

      // devuelve un error si no existe el usuario
      if (!dbUser) {
        return Promise.reject(new Error('user not found'))
      }

      // Se necesita buscar la contribucion
      let dbContrib = yield getContribution(contributionId)

      // devuelve un error si no existe
      if (!dbContrib) {
        return Promise.reject(new Error('contribution not found'))
      }

      /*
        se construye el mensaje, esta es la forma:
        message {
          date: 'date',
          id: 'String',
          message: 'String',
          user: 'String'
        }
      */

      let message = {}
      message.content = content
      message.date = new Date()
      message.id = uuid.v4()
      message.user = {
        username: dbUser.username,
        publicId: dbUser.publicId,
        image: dbUser.avatar
      }

      yield r.db(db).table('contributions').get(dbContrib.id).update({
        messages: r.row('messages').append(message)
      }).run(conn)

      let dbContribActualized = yield getContribution(contributionId)

      // se crea una respuesta
      let res = _.find(dbContribActualized.messages, {id: message.id})
      res.status = 200
      res.contribId = uuid.encode(dbContrib.id)
      return Promise.resolve(res)
    })
    return Promise.resolve(tasks()).asCallback(cb)
  }

  delContribMessage (contributionId, username, messageId, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not Connected'))
    }

    if (!username) {
      return Promise.reject(new Error('Invalid new user')).asCallback(cb)
    }

    if (!contributionId) {
      return Promise.reject(new Error('Invalid contribution ID')).asCallback(cb)
    }

    if (!messageId) {
      return Promise.reject(new Error('Invalid message ID')).asCallback(cb)
    }

    let db = this.db
    let connection = this.connection

    let getUser = this.getUser.bind(this)
    let getContribution = this.getContrib.bind(this)

    let tasks = co.wrap(function * () {
      let conn = yield connection

      // se necesita saber si el usuario existe
      let dbUser = yield getUser(username)

      // devuelve un error si no existe el usuario
      if (!dbUser) {
        return Promise.reject(new Error('user not found'))
      }

      // Se necesita buscar la contribucion
      let dbContrib = yield getContribution(contributionId)

      // devuelve un error si no existe
      if (!dbContrib) {
        return Promise.reject(new Error('contribution not found'))
      }

      // busca el mensaje en la contribucion
      let messageToDel = _.find(dbContrib.messages, function (o) {
        return o.id === messageId
      })

      if (!messageToDel) {
        return Promise.reject(new Error('message ID not found'))
      }

      // revisa si el usuario coincide con el del mensaje
      if (messageToDel.user.username !== username) {
        return Promise.reject(new Error('Unauthorized user'))
      }

      yield r.db(db).table('contributions').get(dbContrib.id).update(function (row) {
        return {
          'messages': row('messages')
          .filter(function (item) {
            return item('id').ne(messageId)
          })
        }
      }).run(conn)

      // se crea una respuesta

      let res = {
        status: 200,
        id: messageId,
        contribId: contributionId,
        message: `message ${messageId} was delete`,
        username: username
      }

      return Promise.resolve(res)
    })
    return Promise.resolve(tasks()).asCallback(cb)
  }

  // ADMIN ACTIONS
  devRes (contributionId, username, devResponse, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not Connected'))
    }

    let db = this.db
    let connection = this.connection

    let getUser = this.getUser.bind(this)
    let getContrib = this.getContrib.bind(this)

    if (!username) {
      return Promise.reject(new Error('Invalid new user')).asCallback(cb)
    }

    let tasks = co.wrap(function * () {
      let conn = yield connection

      // debe reconocer el user
      let dbUser = yield getUser(username)

      if (dbUser.error) {
        return Promise.reject(dbUser)
      }

      // debe reconocer si es un user dev
      if (!dbUser.admin) return Promise.reject(new Error('User not authorized'))

      // debe buscar el id de la contribucion
      let dbContrib = yield getContrib(contributionId)

      // si no la encuentra genera un error
      if (dbContrib.error) {
        return Promise.reject(new Error('Contribution not found'))
      }

      // si no se da un campo de aprovacion, entonces es falsa por defecto
      devResponse.approval = devResponse.approval || false

      // si la encuentra debe asignarle la respuesta del dev
      yield r.db(db).table('contributions').get(dbContrib.id).update({
        dev: devResponse
      }).run(conn)

      let dbContribActualized = yield getContrib(contributionId)

      // Se debe crear la respuesta a la contribucion
      let res = {
        status: 200,
        message: dbContribActualized.dev.message,
        approval: dbContribActualized.dev.approval
      }

      // devuelve un res
      return Promise.resolve(res)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  // busca las feaures que estan en desarrollo
  statusChange () {}

  // asigna el mom
  setManOfMonth (admin, username, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected'))
    }

    if (!admin || !username) {
      return Promise.reject(new Error('invalid users'))
    }

    let db = this.db
    let connection = this.connection

    let getUser = this.getUser.bind(this)

    let tasks = co.wrap(function * () {
      let conn = yield connection

      let userDb = yield getUser(username)

      if (!userDb) {
        return Promise.reject(new Error('user not found'))
      }

      username = userDb.username

      let adminDb = yield getUser(admin)

      if (!adminDb || !adminDb.admin) {
        return Promise.reject(new Error('not authorized'))
      }

      userDb.adminAproved = adminDb.username

      let newMomUser = {
        avatar: userDb.avatar,
        badges: userDb.badges,
        masteries: userDb.masteries,
        level: userDb.level,
        username: userDb.username,
        title: userDb.title,
        dateAdded: new Date(),
        byAdmin: adminDb.username,
        genre: userDb.genre
      }

      let result = yield r.db(db).table('mom').insert(newMomUser).run(conn)

      if (result.errors > 0) {
        return Promise.reject(new Error(result.first_error))
      }

      try {
        newMomUser.id = result.generated_keys[0]
      } catch (error) {
        return Promise.reject(new Error(`error: ${error}`))
      }

      yield r.db(db).table('mom').get(newMomUser.id).update({
        publicId: uuid.encode(newMomUser.id)
      }).run(conn)

      let momCreated = yield r.db(db).table('mom').get(newMomUser.id).run(conn)
      return Promise.resolve(momCreated)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  // obtiene el mom
  getManOfMonth (cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not Connected')).asCallback(cb)
    }

    let db = this.db
    let connection = this.connection

    let tasks = co.wrap(function * () {
      let conn = yield connection

      yield r.db(db).table('mom').indexWait().run(conn)

      let moms = yield r.db(db).table('mom').orderBy({
        index: r.desc('dateAdded')
      }).run(conn)

      let data = yield moms.toArray()

      let info = data.length > 0 ? data[0] : laBete

      let response = {
        status: 200,
        mom: info
      }

      return Promise.resolve(response)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  // SERVICIO DE IMAGENES
  createPicture (image, cb) {
    /*
      return: {
        userId:
        src:
        createdAt:
        awards:
        sponsors:
        name:
      }
    */
    if (!this.connected) {
      return Promise.reject(new Error('not connected'))
    }

    if (!image.src || !image.name) {
      return Promise.reject(new Error('invalid picture'))
    }

    let db = this.db
    let connection = this.connection

    let getUser = this.getUser.bind(this)
    let getPicturesByUser = this.getPicturesByUser.bind(this)

    let tasks = co.wrap(function * () {
      let conn = yield connection

      let username = image.userId

      let userDb = yield getUser(username)

      if (!userDb) {
        return Promise.reject(new Error('user not found'))
      }

      username = userDb.username

      // obetener las imagenes por nombre de usuario
      let imagesByUser

      try {
        imagesByUser = yield getPicturesByUser(username)
      } catch (e) {
        return Promise.reject(e)
      }
      // revisar si la primera imagen tiene diferencia de dos horas
      // con la hora actual.
      if (imagesByUser.length) {
        let date = new Moment(imagesByUser[0].createdAt)
        let limit = date.add(2, 'h')

        let nowDate = new Date()

        if (Moment(limit).isAfter(nowDate)) {
          // si no, devuelve un error con el mensaje: debe esperar XX tiempo
          // antes de poder volver a subir una imagen.
          // let remaining = limit.from(nowDate, true)

          let mili = limit.diff(nowDate, 'milliseconds')
          let xTime = Moment.duration(mili)
          let remaining = xTime.hours() + ':' + xTime.minutes()
          let e = new Error(`${remaining}`)
          e.name = 'lackOfTime'
          return Promise.reject(e)
        }
      }

      image.userId = userDb.publicId
      image.username = userDb.username
      image.createdAt = new Date()
      image.awards = utils.getAwards()
      image.sponsors = []

      let result = yield r.db(db).table('images').insert(image).run(conn)

      if (result.errors > 0) {
        return Promise.reject(new Error(result.first_error))
      }

      image.id = result.generated_keys[0]

      yield r.db(db).table('images').get(image.id).update({
        publicId: uuid.encode(image.id)
      }).run(conn)

      let imageCreated = yield r.db(db).table('images').get(image.id).run(conn)

      return Promise.resolve(imageCreated)
    })
    return Promise.resolve(tasks()).asCallback(cb)
  }

  getPicture (publicId, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not Connected')).asCallback(cb)
    }

    let db = this.db
    let connection = this.connection

    publicId = uuid.decode(publicId)

    let tasks = co.wrap(function * () {
      let conn = yield connection

      let imageDb = yield r.db(db).table('images').get(publicId).run(conn)

      if (!imageDb) {
        return Promise.reject(new Error(`image: ${uuid.encode(publicId)} not found`))
      }

      return Promise.resolve(imageDb)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  getAllPictures (cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not Connected')).asCallback(cb)
    }
    let db = this.db
    let connection = this.connection

    let tasks = co.wrap(function * () {
      let conn = yield connection

      yield r.db(db).table('images').indexWait().run(conn)

      let result = yield r.db(db).table('images').orderBy({
        index: r.desc('createdAt')
      }).run(conn)

      let images = yield result.toArray()

      return Promise.resolve(images)
    })
    return Promise.resolve(tasks()).asCallback(cb)
  }

  deletePicture (publicId, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not Connected')).asCallback(cb)
    }

    let db = this.db
    let connection = this.connection
    publicId = uuid.decode(publicId)

    let tasks = co.wrap(function * () {
      let conn = yield connection

      let response = yield r.db(db).table('images').get(publicId).delete().run(conn)

      if (!response.deleted) {
        return Promise.reject(new Error(`Image ${publicId} not found`))
      }

      let res = {
        code: 200,
        message: 'image was deleted',
        status: 'ok',
        publicId: publicId
      }

      return Promise.resolve(res)
    })
    return Promise.resolve(tasks()).asCallback(cb)
  }

  addPictureAward (publicId, award, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not connected')).asCallback(cb)
    }

    if (!utils.findImageAward(award.type)) {
      return Promise.reject(new Error('Image award invalid'))
    }

    let connection = this.connection
    let db = this.db

    let getPicture = this.getPicture.bind(this)
    let getUser = this.getUser.bind(this)

    let tasks = co.wrap(function* () {
      let conn = yield connection

      let pictureDb = yield getPicture(publicId)

      if (pictureDb.error) {
        return Promise.reject(pictureDb)
      }

      let sponsor = null

      try {
        sponsor = yield getUser(award.sponsor)
      } catch (e) {
        return Promise.reject({error: e, message: 'sponsor does not exist'})
      }

      let sponsorData = {
        sponsorId: sponsor.publicId,
        username: sponsor.username,
        type: award.type
      }

      let imageSponsors = pictureDb.sponsors
      let awards = {
        amazing: 0,
        bastard: 0,
        takeMyMoney: 0
      }

      if (imageSponsors.length > 0) {
        for (let i = 0; i <= imageSponsors.length - 1; i++) {
          switch (imageSponsors[i].type) {
            case 'amazing':
              awards.amazing += 1
              break
            case 'bastard':
              awards.bastard += 1
              break
            case 'takeMyMoney':
              awards.takeMyMoney += 1
              break
            default:
              return Promise.reject(new Error('invalid image award'))
          }
        }
      }

      let sponsorInDb = _.find(pictureDb.sponsors, {'sponsorId': sponsorData.sponsorId})

      if (sponsorInDb !== undefined) {
        awards[sponsorInDb.type] -= 1

        yield r.db(db).table('images').get(pictureDb.id).update({
          awards: awards,
          sponsors: r.row('sponsors')
            .filter(function (sponsor) {
              return sponsor('sponsorId').ne(`${sponsorData.sponsorId}`)
            })
        }).run(conn)

        if (sponsorInDb.type !== award.type) {
          awards[award.type] += 1
          yield r.db(db).table('images').get(pictureDb.id).update({
            awards: awards,
            sponsors: r.row('sponsors').append(sponsorData)
          }).run(conn)
        }
      } else {
        awards[award.type] += 1
        yield r.db(db).table('images').get(pictureDb.id).update({
          awards: awards,
          sponsors: r.row('sponsors').append(sponsorData)
        }).run(conn)
      }

      let updatedPicture = yield getPicture(pictureDb.publicId)

      return Promise.resolve(updatedPicture)
    })
    return Promise.resolve(tasks()).asCallback(cb)
  }

  getPicturesByUser (username, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('Not connected')).asCallback(cb)
    }

    let db = this.db
    let connection = this.connection
    let getUser = this.getUser.bind(this)

    let tasks = co.wrap(function * () {
      let conn = yield connection
      let userDb = yield getUser(username)

      if (userDb.error) {
        return Promise.reject(userDb)
      }

      let userId = userDb.publicId

      yield r.db(db).table('images').indexWait().run(conn)

      let images = yield r.db(db).table('images').getAll(userId, {
        index: 'userId'
      }).orderBy(r.desc('createdAt')).run(conn)

      let result = yield images.toArray()

      return Promise.resolve(result)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }

  // Servicio de autentificacion
  authenticate (username, password, cb) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(cb)
    }

    let getUser = this.getUser.bind(this)

    let tasks = co.wrap(function* () {
      let user = null

      try {
        user = yield getUser(username)
      } catch (e) {
        return Promise.resolve(false)
      }

      if (user.password === utils.encrypt(password)) {
        return Promise.resolve(true)
      }

      return Promise.resolve(false)
    })

    return Promise.resolve(tasks()).asCallback(cb)
  }
}

module.exports = Database
