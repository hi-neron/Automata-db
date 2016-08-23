'use strict'
const uuid = require('uuid-base62')

module.exports = {
  getImage () {
    return {}
  },
  getImages (n) {
    return {}
  },
  getUser () {
    return {
      name: 'whatever user',
      username: `user_${uuid.v4()}`,
      password: uuid.uuid(),
      email: `${uuid.uuid()}@automata.co`
    }
  },
  getUsers (n) {
    let users = []
    while (n-- > 0) {
      users.push(this.getUser())
    }
    return users
  },
  getMessage () {
    return {
      from: `user_${uuid.v4()}`,
      message: 'This a new message',
      subject: 'whatever subject'
    }
  },
  getAlert () {
    return {
      type: '',
      message: '',
      from: ''
    }
  }
}

