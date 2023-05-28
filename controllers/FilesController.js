/* A script that defines endpoints: POST /files, GET /files/:id, 
 * GET /files, PUT /files/:id/publish, PUT /files/:id/unpublish, 
 * GET /files/:id/data (which creates a new file in DB and in disk)
 */
 
import Queue from 'bull';
import fs from 'fs';
import mime from 'mime-types';
import { ObjectId } from 'mongodb';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import authUtils from '../utils/auth';
import dbClient from '../utils/db';

class FilesController {
  static async postUpload(request, response) {
    const checkAuth = await authUtils.checkAuth(request);
    if (checkAuth.status !== 200) return response.status(401).send({ error: 'Unauthorized' });

    const userId = checkAuth.payload.id;
    const { name, type, data } = request.body;
    const parentId = request.body.parentId || 0;
    const isPublic = request.body.isPublic || false;
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    
	if (!fs.existsSync(folderPath)) {
      try {
        fs.mkdirSync(folderPath, { recursive: true });
      } catch (e) {
        console.error(e);
        return response.status(500).send({ error: 'Unable to locate folder' });
      }
    }

    if (!name) return response.status(400).send({ error: 'Missing name' });
    
	if (!type || !['folder', 'file', 'image'].includes(type)) return response.status(400).send({ error: 'Missing type' });
    
	if (!data && type !== 'folder') return response.status(400).send({ error: 'Missing data' });
    
	if (parentId) {
      const parent = await dbClient.files.findOne({ _id: new ObjectId(parentId) });
      if (!parent) return response.status(400).send({ error: 'Parent not found' });

      if (parent.type !== 'folder') return response.status(400).send({ error: 'Parent is not a folder' });
    }

    if (type === 'folder') {
      const fileDBObj = {
        userId,
        name,
        type,
        parentId: parentId ? ObjectId(parentId) : 0,
      };

      dbClient.files.insertOne(fileDBObj);
      return response.status(201).send({
        id: fileDBObj._id,
        userId,
        name,
        type,
        isPublic,
        parentId: parentId ? ObjectId(parentId) : 0,
      });
    }

    const filename = uuidv4();
    const localPath = `${folderPath}/${filename}`;
    const decodedData = Buffer.from(data, 'base64');
    fs.writeFileSync(localPath, decodedData, { flag: 'w+' });

    const fileDBObj = {
      userId,
      name,
      type,
      isPublic,
      parentId: parentId ? ObjectId(parentId) : 0,
      localPath,
    };

    dbClient.files.insertOne(fileDBObj);

    if (type === 'image') {
      const fileQueue = Queue('fileQueue');
      await fileQueue.add({ userId, fileId: fileDBObj._id });
    }

    return response.status(201).send({
      id: fileDBObj._id,
      userId,
      name,
      type,
      isPublic,
      parentId: parentId ? ObjectId(parentId) : 0,
    });
  }

  static async getShow(request, response) {
    const checkAuth = await authUtils.checkAuth(request);
    if (checkAuth.status !== 200) return response.status(401).send({ error: 'Unauthorized' });

    const userId = checkAuth.payload.id;
    let { id } = request.params;
    
	try {
      id = ObjectId(id);
    } catch (e) {
      return response.status(404).send({ error: 'Not found' });
    }
    
	const requestedFile = await dbClient.files.findOne({
      _id: ObjectId(id),
      userId: ObjectId(userId),
    });

    if (!requestedFile) return response.status(404).send({ error: 'Not found' });

    const {
      _id,
      name,
      type,
      isPublic,
      parentId,
    } = requestedFile;

    return response.status(200).send({
      id: _id,
      userId,
      name,
      type,
      isPublic,
      parentId,
    });
  }

  static async getIndex(request, response) {
    const checkAuth = await authUtils.checkAuth(request);
    if (checkAuth.status !== 200) return response.status(401).send({ error: 'Unauthorized' });

    const userId = checkAuth.payload.id;
    let { parentId, page } = request.query;
    page = page ? Number(page, 10) : 0;

    if (!parentId || parentId === '0') {
      parentId = 0;
    } else {
      try {
        parentId = ObjectId(parentId);
      } catch (e) {
        parentId = 0;
      }
    }

    const query = [
      { $match: { parentId, userId: ObjectId(userId) } },
      { $skip: page * 20 },
      { $limit: 20 },
    ];

    const requestedFiles = await dbClient.files.aggregate(query).toArray();
    const sanitizedFiles = [];
    
	for (const elem of requestedFiles) {
      const file = {
        id: elem._id,
        name: elem.name,
        type: elem.type,
        isPublic: elem.isPublic,
        parentId: elem.parentId,
      };
      sanitizedFiles.push(file);
    }
    return response.status(200).send(sanitizedFiles);
  }

  static async putPublish(request, response) {
    const checkAuth = await authUtils.checkAuth(request);
    if (checkAuth.status !== 200) return response.status(401).send({ error: 'Unauthorized' });

    const userId = checkAuth.payload.id;
    let { id } = request.params;
	
    try {
      id = ObjectId(id);
    } catch (e) {
      return response.status(404).send({ error: 'Not found' });
    }
	
    const requestedFile = await dbClient.files.findOne({
      _id: ObjectId(id),
      userId: ObjectId(userId),
    });

    if (!requestedFile) return response.status(404).send({ error: 'Not found' });

    const {
      _id,
      name,
      type,
      parentId,
    } = requestedFile;

    dbClient.files.updateOne(
      { _id: ObjectId(id) },
      { $set: { isPublic: true } },
    );

    return response.status(200).send({
      id: _id,
      userId,
      name,
      type,
      isPublic: true,
      parentId,
    });
  }

  static async putUnpublish(request, response) {
    const checkAuth = await authUtils.checkAuth(request);
    if (checkAuth.status !== 200) return response.status(401).send({ error: 'Unauthorized' });

    const userId = checkAuth.payload.id;
    let { id } = request.params;
	
    try {
      id = ObjectId(id);
    } catch (e) {
      return response.status(404).send({ error: 'Not found' });
    }
    
	const requestedFile = await dbClient.files.findOne({
      _id: ObjectId(id),
      userId: ObjectId(userId),
    });

    if (!requestedFile) return response.status(404).send({ error: 'Not found' });

    const {
      _id,
      name,
      type,
      parentId,
    } = requestedFile;

    dbClient.files.updateOne(
      { _id: ObjectId(id) },
      { $set: { isPublic: false } },
    );

    return response.status(200).send({
      id: _id,
      userId,
      name,
      type,
      isPublic: false,
      parentId,
    });
  }

  static async getFile(request, response) {
    const checkAuth = await authUtils.checkAuth(request);
    const userId = checkAuth.status === 200 ? checkAuth.payload.id.toString() : undefined;
    let { id } = request.params;
    const { size } = request.query;
    
	try {
      id = ObjectId(id);
    } catch (e) {
      return response.status(404).send({ error: 'Not found' });
    }

    const requestedFile = await dbClient.files.findOne({ _id: ObjectId(id) });
    
	if (!requestedFile) return response.status(404).send({ error: 'Not found' });
    
	if (requestedFile.userId.toString() !== userId && !requestedFile.isPublic) return response.status(404).send({ error: 'Not found' });
    
	if (requestedFile.type === 'folder') return response.status(400).send({ error: 'A folder doesn\'t have content' });

    if (size && requestedFile.type === 'image') {
      requestedFile.localPath = `${requestedFile.localPath}_${size}`;
      console.log(requestedFile.localPath);
    }

    if (!fs.existsSync(requestedFile.localPath)) return response.status(404).send({ error: 'Not found' });
    
	const mimeType = mime.lookup(path.extname(requestedFile.name));
    let fileContent;
    
	try {
      fileContent = fs.readFileSync(requestedFile.localPath, { flag: 'r' });
    } catch (e) {
      return response.status(404).send({ error: 'Not found' });
    }
    return response.status(200).setHeader('content-type', mimeType).send(fileContent);
  }
}

module.exports = FilesController;
