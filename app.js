const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000')
    })
  } catch (e) {
    console.log(`DB Errorr: ${e.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const checkNewuserQuery = `SELECT * FROM user WHERE username='${username}';`
  const newUser = await db.get(checkNewuserQuery)
  if (newUser !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else if (newUser === undefined && password.length < 6) {
    response.status(400)
    response.send('Password is too short')
  } else {
    const hashedPassword = await bcrypt.hash(password, 10)
    const createUserQuery = `INSERT INTO user (name,username,password,gender)
    VALUES(
      '${name}',
      '${username}',
      '${hashedPassword}',
      '${gender}'
    );`
    await db.run(createUserQuery)
    response.send('User created successfully')
  }
})

const secretKey = 'mahimajyothi'
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const checkUserExistQuery = `SELECT * FROM user WHERE username='${username}';`
  const userExist = await db.get(checkUserExistQuery)
  if (userExist === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatch = await bcrypt.compare(password, userExist.password)
    if (!isPasswordMatch) {
      response.status(400)
      response.send('Invalid password')
    } else {
      const payload = {username: username}
      const jwtToken = await jwt.sign(payload, secretKey)
      response.send({jwtToken})
    }
  }
})

const loggedUserAuthenctication = (request, response, next) => {
  let jwtToken = null
  const authHeaders = request.headers['authorization']
  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, secretKey, async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}
//API - 3 Latest 4 tweets whom the User Follows
app.get(
  '/user/tweets/feed/',
  loggedUserAuthenctication,
  async (request, response) => {
    const {username} = request
    const getUserQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const userId = await db.get(getUserQuery)
    const followingUserIdsQuery = `SELECT following_user_id FROM
   follower WHERE follower_user_id=${userId.user_id};`
    const followingUserIds = await db.all(followingUserIdsQuery)
    const followingUsers = followingUserIds.map(user => user.following_user_id)
    const getLatesttweetsQuery = `SELECT username,tweet, date_time AS dateTime
    FROM user INNER JOIN tweet ON user.user_id=tweet.user_id WHERE 
    tweet.user_id IN (${followingUsers.join(',')})
    ORDER BY dateTime DESC
    LIMIT 4;
    `
    const getTweets = await db.all(getLatesttweetsQuery)
    response.send(getTweets)
  },
)

//API - 4 Get Names of User Follows
app.get(
  '/user/following/',
  loggedUserAuthenctication,
  async (request, response) => {
    const {username} = request
    const getUserQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const userId = await db.get(getUserQuery)
    const followingUserIdsQuery = `SELECT following_user_id FROM
    follower WHERE follower_user_id=${userId.user_id};`
    const followingUserIds = await db.all(followingUserIdsQuery)
    const followingUsers = followingUserIds.map(user => user.following_user_id)
    const getFollowingNamesQuery = `SELECT name FROM user WHERE user_id 
    IN (${followingUsers.join(',')});`
    const followingNames = await db.all(getFollowingNamesQuery)
    response.send(followingNames)
  },
)
//API - 5 Get Names of Follower of the Users
app.get(
  '/user/followers/',
  loggedUserAuthenctication,
  async (request, response) => {
    const {username} = request
    const getUserQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const userId = await db.get(getUserQuery)
    const getFollowersQuery = `SELECT follower_user_id FROM follower
   WHERE following_user_id=${userId.user_id};`
    const getFollowers = await db.all(getFollowersQuery)
    const followers = getFollowers.map(user => user.follower_user_id)
    const getFollowerNamesQuery = `SELECT name FROM user
    WHERE user_id IN (${followers.join(',')});`
    const followerNames = await db.all(getFollowerNamesQuery)
    response.send(followerNames)
  },
)

//API - 6 Get Tweets of the Following User
app.get(
  '/tweets/:tweetId/',
  loggedUserAuthenctication,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const getUserQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const userId = await db.get(getUserQuery)
    const followingUserIds = `SELECT following_user_id FROM
  follower WHERE follower_user_id=${userId.user_id};`
    const followingUsers = await db.all(followingUserIds)
    const users = followingUsers.map(user => user.following_user_id)
    const getTweetsQuery = `SELECT tweet.tweet,
  (SELECT COUNT(like_id)  FROM like WHERE tweet_id=${tweetId}) AS likes,
  (SELECT COUNT(reply_id)  FROM reply WHERE tweet_id=${tweetId}) AS replies,
  tweet.date_time AS dateTime 
  FROM tweet 
  WHERE tweet_id=${tweetId} AND user_id IN (${users.join(',')});`
    const getTweets = await db.get(getTweetsQuery)
    if (getTweets) {
      response.send(getTweets)
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API - 7 Get Username Who liked the Tweet
app.get(
  '/tweets/:tweetId/likes/',
  loggedUserAuthenctication,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const getUserQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const userId = await db.get(getUserQuery)
    const followingUserIds = `SELECT following_user_id FROM
     follower WHERE follower_user_id=${userId.user_id};`
    const followingUsers = await db.all(followingUserIds)
    const users = followingUsers.map(user => user.following_user_id)
    const checkTweetBelongsToFollowedUserQuery = `SELECT * FROM tweet 
    WHERE tweet_id=${tweetId} AND user_id IN (${users.join(',')});`
    const tweetBelongsToFollowedUser = await db.get(
      checkTweetBelongsToFollowedUserQuery,
    )
    if (tweetBelongsToFollowedUser) {
      const getLikedNamesQuery = `SELECT user.username AS likes FROM user 
      INNER JOIN like ON user.user_id=like.user_id WHERE 
      like.tweet_id=${tweetId};`
      const likedNames = await db.all(getLikedNamesQuery)
      //console.log(likedNames)
      response.send({likes: likedNames.map(user => user.likes)})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API - 8 GET List Of Replies Of a Tweet
app.get(
  '/tweets/:tweetId/replies/',
  loggedUserAuthenctication,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const getUserQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const userId = await db.get(getUserQuery)
    const followingUserIds = `SELECT following_user_id FROM
     follower WHERE follower_user_id=${userId.user_id};`
    const followingUsers = await db.all(followingUserIds)
    const users = followingUsers.map(user => user.following_user_id)
    const getUsersTweet = `SELECT * FROM tweet WHERE tweet_id=${tweetId}
    AND user_id IN (${users.join(',')});`
    const usersTweet = await db.get(getUsersTweet)
    if (usersTweet) {
      const getRepliesQuery = `SELECT name, reply FROM user INNER JOIN reply ON
      user.user_id=reply.user_id WHERE reply.tweet_id=${tweetId};`
      const repliesList = await db.all(getRepliesQuery)
      response.send({replies: repliesList})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API - 9 GET list of All Tweets

app.get(
  '/user/tweets/',
  loggedUserAuthenctication,
  async (request, response) => {
    const {username} = request
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const userId = await db.get(getUserIdQuery)
    console.log(userId)
    const getTweetsQuery = `SELECT tweet, COUNT(DISTINCT like.like_id) AS likes,
    COUNT(DISTINCT reply.reply_id) AS replies,
    date_time AS dateTime from tweet 
    LEFT JOIN like ON tweet.tweet_id=like.tweet_id 
    LEFT JOIN reply ON tweet.tweet_id=reply.tweet_id
    WHERE tweet.user_id=${userId.user_id}
    GROUP BY tweet.tweet_id;`
    const getTweets = await db.all(getTweetsQuery)
    response.send(getTweets)
  },
)

//API - 10 create a Tweet
app.post(
  '/user/tweets/',
  loggedUserAuthenctication,
  async (request, response) => {
    const {username} = request
    const {tweet} = request.body
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const userId = await db.get(getUserIdQuery)
    const createTweetQuery = `INSERT INTO tweet(tweet,user_id,date_time)
  VALUES(
    '${tweet}',
    ${userId.user_id},
    datetime('now')
  );`
    await db.run(createTweetQuery)
    response.send('Created a Tweet')
  },
)

//API - 11 Delete The Tweet
app.delete(
  '/tweets/:tweetId/',
  loggedUserAuthenctication,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const userId = await db.get(getUserIdQuery)
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId} AND 
    user_id=${userId.user_id};`
    const deleteTweetRequest = await db.run(deleteTweetQuery)
    if (deleteTweetRequest.changes !== 1) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      response.send('Tweet Removed')
    }
  },
)
module.exports = app
