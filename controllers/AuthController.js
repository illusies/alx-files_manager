/* A script that defines endpoints: GET /connect (which should sign-in
 * the user by generating a new authentication token); GET /disconnect
 * (which should sign-out the user based on the token); GET /users/me 
 * (which should retrieve the user base on the token used)
 */

import sha1 from 'sha1';
import { v4 as uuidv4 } from 'uuid';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AuthController {
  static async getConnect(request, response) {
    if (!request.headers.authorization) return response.status(401).send({ error: 'Unauthorized' });

    const authPayload = request.headers.authorization.split(' ')[1];
    const decodedAuthPayload = Buffer.from(authPayload, 'base64').toString('ascii');
    const [email, clearPwd] = decodedAuthPayload.split(':');

    const user = await dbClient.users.findOne({ email });
    if (!user || sha1(clearPwd) !== user.password) return response.status(401).send({ error: 'Unauthorized' });

    const authToken = uuidv4();
    const redisKey = `auth_${authToken}`;

    redisClient.set(redisKey, user._id.toString(), 86400);

    return response.status(200).send({ token: authToken });
  }

  static async getDisconnect(request, response) {
    if (!request.headers['x-token']) return response.status(401).send({ error: 'Unauthorized' });

    const redisKey = `auth_${request.headers['x-token']}`;
    const userId = await redisClient.get(redisKey);

    if (!userId) return response.status(401).send({ error: 'Unauthorized' });

    await redisClient.del(redisKey);

    return response.status(204).end();
  }
}

module.exports = AuthController;
