'use strict'
const uuid = require('uuid-base62')

module.exports = {
  getImage () {
    return {
      description: 'a random description',
      url: `https://image.com/${uuid.v4()}.jpg`,
      userId: ''
    }
  },
  getImages (n) {
    let users = []
    while (n-- > 0) {
      users.push(this.getImage())
    }
    return users
  },
  getUser () {
    return {
      name: 'whatever user',
      username: `user_${uuid.v4()}`,
      password: uuid.uuid(),
      email: `${uuid.uuid()}@automata.co`,
      bio: 'it is a bio with 200 ascii length'
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
      from: 'system',
      type: 'You sucks',
      message: 'some message'
    }
  }
}

