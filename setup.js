'use strict'

const Db = require('.')
const config = require('./config')

config.db.setup = true

const db = new Db(config.db)

db.connect()
  .then(conn => {
    console.log('OK... DB ready to use')
    process.exit(0)
  })
