'use strict'
const uuid = require('uuid-base62')
const lorem = require('lorem-ipsum')

module.exports = {
  getImage () {
    return {
      description: 'a random description',
      src: `https://image.com/${uuid.v4()}.jpg`,
      userId: `username_${uuid.v4()}`
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
  },
  getContrib () {
    return {
      title: 'Esto es un titulo',
      data: {
        type: 'feature',
        info: 'esto podria ser una gran ideacon varios tags en camino #hagamos el #Amor',
        image: 'http://aquiUnaMuestra.jpg'
      }
    }
  },
  getContribMessage () {
    return {
      userName: `user_${uuid.v4()}`,
      userId: uuid.uuid(),
      message: lorem({
        count: 1,
        units: 'sentences'
      }),
      image: 'http://estoEsUnaImge.jpg',
      rate: 3
    }
  },
  getDevData (approved) {
    return {
      message: lorem({
        count: 1,
        units: 'sentences'
      }),
      approval: approved
    }
  },
  getGrid () {
    let grid = []

    for (let x = 0; x < 3; x++) {
      grid.push([])
      for (let y = 0; y < 3; y++) {
        grid[x].push({
          image: this.getImage()
        })
      }
    }
    return {
      grid: grid
    }
  }
}
