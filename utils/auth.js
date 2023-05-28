import { ObjectId } from 'mongodb';
import dbClient from './db';
import redisClient from './redis';

class AuthUtils {
  async checkAuth(req) {
    if (!req.headers['x-token']) return { status: 401, payload: { error: 'Unauthorized' } };

    this.redisKey = `auth_${req.headers['x-token']}`;
    this.userId = await redisClient.get(this.redisKey);
    this.user = await dbClient.users.findOne({ _id: new ObjectId(this.userId) });

    if (!this.user) return { status: 401, payload: { error: 'Unauthorized' } };
    return { status: 200, payload: { id: this.user._id, email: this.user.email } };
  }
}

const authUtils = new AuthUtils();
module.exports = authUtils;
