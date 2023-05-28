/* A script that defines 2 endpoints: GET /status (which returns
 * with status code 200 if Redis and DB is alive) and GET /stats (which 
 * returns the number of users and files in DB with status code 200)
 */
 
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AppController {
  static getStatus(request, response) {
    response.status(200).send({ redis: redisClient.isAlive(), db: dbClient.isAlive() });
  }

  static async getStats(request, response) {
    response.status(200).send({ users: await dbClient.nbUsers(), files: await dbClient.nbFiles() });
  }
}

module.exports = AppController;
