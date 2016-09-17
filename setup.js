'use strict'

const Db = require('.')
const config = require('./config')

config.db.setup = true

const db = new Db(config.db)

db.connect()
  .then(conn => {
    console.log('setup db')
    process.exit(0)
  })
