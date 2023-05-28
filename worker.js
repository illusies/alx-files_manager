// A script that creates a queue fileQueue using the Bull module

import Queue from 'bull';
import fs from 'fs';
import imageThumbnail from 'image-thumbnail';
import { ObjectId } from 'mongodb';
import dbClient from './utils/db';

const fileQueue = Queue('fileQueue');

fileQueue.process(async (job, done) => {
  const { fileId, userId } = job.data;
  if (!fileId) done(new Error('Missing fileId'));
  if (!userId) done(new Error('Missing userId'));

  const requestedFile = await dbClient.files.findOne({
    _id: ObjectId(fileId),
    userId: ObjectId(userId),
  });

  if (!requestedFile) done(new Error('File not found'));

  const sizes = [500, 250, 100];
  const imgBuffer = fs.readFileSync(requestedFile.localPath);
  for (const size of sizes) {
    imageThumbnail(imgBuffer, { width: size })
      .then((thumbnail) => fs.writeFileSync(`${requestedFile.localPath}_${size}`, thumbnail));
  }

  done();
});

const userQueue = Queue('userQueue');

userQueue.process(async (job, done) => {
  const { userId } = job.data;
  if (!userId) done(new Error('Missing userId'));

  const user = await dbClient.users.findOne({ _id: ObjectId(userId) });
  if (!user) done(new Error('User not found'));

  console.log(`Welcome ${user.email}!`);
  done();
});
