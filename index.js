import { createUpdateRagiList } from "./services/createUpdateRagiList.js";
import got from 'got';
import getRedisClient from './redis.js'
import express from 'express';
import dotenv from 'dotenv';
import cron from 'node-cron';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import { uploadToYoutube } from './uploadToYoutube.js';
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg';
dotenv.config();
ffmpeg.setFfmpegPath(ffmpegPath);

let ragiList;
let redisClient;
const app = express();
const PORT = process.env.PORT || 5000

const getIndianDate = () => new Date(new Date().toLocaleString(undefined, { timeZone: 'Asia/Kolkata' }));

const updateRagiList = async () => {
  try {
    await createUpdateRagiList()
    console.log('ragi list updated sussessfully ')
    ragiList = JSON.parse(fs.readFileSync('./ragiList.json', 'UTF-8'));
  }
  catch (err) {
    console.log(err)
  }
}

const recordStream = (duty, endMilliseconds, to, from) => {
  const sgpcUrl = process.env.sgpcUrl;
  const currentIndianDate = getIndianDate();
  const date = currentIndianDate.getDate();
  const month = currentIndianDate.getMonth() + 1;
  const year = currentIndianDate.getFullYear();
  const recordingTimestamp = `${date}-${month}-${year}(${from} - ${to})`;
  console.log('recording started at', recordingTimestamp)
  console.log('recordinds ends after ', endMilliseconds, 'milliseconds')
  const fileName = `${duty.trim()} Darbar Sahib Kirtan Duty ${recordingTimestamp}`;
  const liveGurbaniStream = got.stream(sgpcUrl)
  const outputPath = `./${fileName}.mp4`;
  const dayImgPath = './darbarSahibDay.gif';
  const NightImgPath = './darbarSahibNight.gif'
  const command = ffmpeg()
  command.input((getIndianDate().getHours() >= 19 || getIndianDate().getHours() <= 5) ? NightImgPath : dayImgPath)
    .inputOptions(['-ignore_loop', '0'])
    .input(liveGurbaniStream)
    .audioCodec('aac')
    .audioBitrate('128k')
    .videoCodec('libx264')
    .outputOptions('-crf', '28', '-preset', 'fast', '-movflags', '+faststart')
    .output(outputPath)
    .on('end', function () {
      setTimeout(() => {
        try {
          console.log('upload to youtube started for', outputPath)
          uploadToYoutube(outputPath, redisClient)
        } catch (err) {
          console.log(err)
        }
      }, 59000); //procesing takes time after killing ffmpeg()
      command.kill('SIGTERM');
    })
    .on('error', (err) => console.log('An error occurred: ' + err.message))
    .run();

  setTimeout(() => {
    command.emit('end')
  }, endMilliseconds)
}

setInterval(() => {
  const currentIndianDate = getIndianDate();
  const date = currentIndianDate.getDate();
  const month = currentIndianDate.getMonth() + 1;
  const fullYear = currentIndianDate.getFullYear();
  const formattedIndianDate = `${date.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${fullYear.toString()}`;
  const config = ragiList[formattedIndianDate]?.find((config) => config?.from.split('-')[0] == currentIndianDate.getHours() && config?.from.split('-')[1] == currentIndianDate.getMinutes())
  if (config) {
    let endMilliseconds;
    if (config.to.trim().toLowerCase() === 'till completion')
      endMilliseconds = 1000 * 60 * 90;
    else
      endMilliseconds = ((parseInt(config.to.split('-')[0]) - parseInt(config.from.split('-')[0])) + (parseInt(config.to.split('-')[1]) - parseInt(config.from.split('-')[1])) / 60) * 60 * 60 * 1000;
    recordStream(config.duty, endMilliseconds, config.to, config.from)
  }
}, 60000)

function deleteMediaFilesIfLeftAny() {
  const files = fs.readdirSync('.');
  files.forEach((file) => {
    if (file.endsWith('.mp4')) {
      fs.unlinkSync(file);
      console.log(`Deleted file: ${file} as it is left undeleted`);
    }
  });
}

app.get('/', (req, res) => {
  res.send(ragiList)
})

app.get('/google/callback', (req, res) => {
  res.send(req.query)
})

app.get('/currentproject', async (req, res) => {
  const current = await redisClient.get('current');
  const perProjectQuota = await redisClient.get('perProjectQuota');
  const currentProjectInfo = { current, perProjectQuota }
  res.send(currentProjectInfo); let cronSchedulers = [];
});

app.listen(PORT, async () => {
  console.log(`server listening on port ${PORT}`);
  redisClient = await getRedisClient();
  updateRagiList()
  deleteMediaFilesIfLeftAny();
});

cron.schedule('20 1 * * *', () => { //scheduled mp4 deleter if any mp4 file is left undeleted 
  deleteMediaFilesIfLeftAny()
}, {
  timezone: 'Asia/Kolkata'
})

cron.schedule('20 1,17,10 1,2,3,14,15,16,17 * *', () => { //schedule ragiListUpdate
  updateRagiList()
}, {
  timezone: 'Asia/Kolkata'
})

process.on('uncaughtException', (err) => {
  console.log(err)
});
process.on('unhandledRejection', (err) => {
  console.log(err)
})
