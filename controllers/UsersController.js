// A script that contains the new endpoint
 
import Queue from 'bull';
import sha1 from 'sha1';
import dbClient from '../utils/db';
import authUtils from '../utils/auth';

class UsersController {
  static async postNew(request, response) {
    const { email, password } = request.body;

    if (!email) return response.status(400).send({ error: 'Missing email' });
    if (!password) return response.status(400).send({ error: 'Missing password' });

    if (await dbClient.users.findOne({ email })) return response.status(400).send({ error: 'Already exist' });

    let user;
    try {
      user = await dbClient.users.insertOne({ email, password: sha1(password) });
    } catch (err) {
      return response.status(400).send({ error: `DB insert failed: ${err}` });
    }

    const userQueue = Queue('userQueue');
    userQueue.add({ userId: user.insertedId });

    return response.status(201).send({ id: user.insertedId, email });
  }

  static async getMe(request, response) {
    const result = await authUtils.checkAuth(request);
    return response.status(result.status).send(result.payload);
  }
}

module.exports = UsersController;
