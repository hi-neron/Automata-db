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

    if (!username || username === '') {
      return Promise.reject(new Error('User name invalid'))
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
      user.masteries = user.masteries || []
      user.memory = user.memory || 'none'

      // Scores & prizes
      user.skills = user.skills || []
      user.points = 0
      user.badges = []
      user.level = 0
      user.title = ''

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
      console.log(normalizedMasteries[i])
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

  // Modulo de puntajes
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

  // Servicio de imagenes
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

      console.log(imageSponsors)

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
        console.log(awards, sponsorInDb, '/ add award / sponsor alrea')

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
