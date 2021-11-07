/**************************************************************************
 * 
 *  DLMP3 Bot: A Discord bot that plays local mp3 audio tracks.
 *  (C) Copyright 2020
 *  Programmed by Andrew Lee 
 *  
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 * 
 ***************************************************************************/
import fs from 'fs';
import path from 'path'
import Discord from 'discord.js';
import { parse } from "discord-command-parser";
import meow from 'meow'


const cli = meow(`
  Bot to play music for Odyssey
`, {
  importMeta: import.meta,
  flags: {
    songs: {
      alias: 's',
      description: 'song directory',
      type: 'string',
      default: './music',
      required: true
    },
    random: {
      alias: 'r',
      description: 'randomized play',
      type: 'boolean',
      default: false
    },
    config: {
      alias: 'c',
      description: 'config json file',
      type: 'string',
      default: './config.json',
      required: true
    }
  }
})


// parse JSON string to JSON object
const data = fs.readFileSync(path.resolve(cli.flags.config), 'utf-8')
const config = JSON.parse(data);


const bot = new Discord.Client();

let isRandom = cli.flags.random;
let songs = path.resolve(cli.flags.songs);
let dispatcher = null;
let songName = '';
let songIdx = -1;
let volume = (
  config.startingVolume && !isNaN(Number(config.startingVolume))
) ? Number(config.startingVolume) : 1

bot.login(config.token);


function searchForSong() {
  console.log('Searching .mp3 or .flac file...');
  const files = fs.readdirSync(songs);
  songIdx = (isRandom) ? Math.floor(Math.random() * files.length) : songIdx + 1;
  if (songIdx >= files.length) songIdx = 0;
  const audio = songIdx < files.length ? files[songIdx] : ''
  if (audio.search(/\.(?:mp3|flac)/)) return audio
  else return null
}

function playAudio() {

  const voiceChannel = bot.channels.cache.get(config.voiceChannel);
  if (!voiceChannel) return console.error('The voice channel does not exist!\n(Have you looked at your configuration?)');
  
  voiceChannel.join().then(connection => {

    const searchAndWait = () => {
      songName = searchForSong()
      if (songName == null) {
        setTimeout(searchAndWait, 1000)
      } else {

        if (volume) console.log('Setting volume to ' + volume)
        dispatcher = connection.play(path.resolve(songs, songName), { volume });

        dispatcher.on('start', () => {

          console.log('Now playing ' + songName);
          const statusEmbed = new Discord.MessageEmbed()
            .addField('Now Playing', `${songName}`)
            .setColor('#0066ff')

          const statusChannel = bot.channels.cache.get(config.statusChannel);
          if (!statusChannel) return console.error('The status channel does not exist! Skipping.');
          statusChannel.send(statusEmbed);

        });

        dispatcher.on('error', console.error);

        dispatcher.on('finish', () => {
          console.log('Music has finished playing.');
          playAudio();
        });
      }
    }

    searchAndWait()
    
  }).catch(e => {
    console.error(e);
  });
  
}

bot.on('ready', () => {

  console.log('Bot is ready!');
  console.log(`Logged in as ${bot.user.tag}!`);
  console.log(`Prefix: ${config.prefix}`);

  bot.user.setPresence({
    activity: {
      name: `Music | ${config.prefix}help`
    },
    status: 'online',
  }).then(
    presence => console.log(`Activity set to "${presence.activities[0].name}"`)
  ).catch(console.error);

  const readyEmbed = new Discord.MessageEmbed()
    .setAuthor(`${bot.user.username}`, bot.user.avatarURL())
    .setDescription('Starting bot...')
    .setColor('#0066ff')

  const statusChannel = bot.channels.cache.get(config.statusChannel);
  if (!statusChannel) return console.error('The status channel does not exist! Skipping.');
  statusChannel.send(readyEmbed);
  console.log('Connected to the voice channel.');
  playAudio();

});

bot.on('message', async msg => {

  if (msg.author.bot) return;
  if (!msg.guild) return;

  const parsed = parse(msg, config.prefix, { allowSpaceBeforeCommand: true });
  if (!parsed.success) return;

  const command = parsed.command
  const args = parsed.arguments

  // Public allowed commands

  if (command == 'help') {

    if (!msg.guild.member(bot.user).hasPermission('EMBED_LINKS'))
      return msg.reply('**ERROR: This bot doesn\'t have the permission to send embed links please enable them to use the full help.**');

    const helpEmbed = new Discord.MessageEmbed()
      .setAuthor(`${bot.user.username} Help`, bot.user.avatarURL())
      .setDescription(`Currently playing \`${songName}\`.`)
      .addField('Public Commands', `${config.prefix}help\n${config.prefix}ping\n${config.prefix}git\n${config.prefix}playing\n${config.prefix}about\n`, true)
      .addField('Bot Owner Only', `${config.prefix}join\n${config.prefix}resume\n${config.prefix}pause\n${config.prefix}skip\n${config.prefix}leave\n${config.prefix}stop\n`, true)
      .setFooter('© Copyright 2020 Andrew Lee. Licensed with GPL-3.0.')
      .setColor('#0066ff')

    msg.channel.send(helpEmbed);

  }

  if (command == 'ping') {
    msg.reply('Pong!');
  }

  if (command == 'git') {
    msg.reply('This is the source code of this project.\nhttps://github.com/Alee14/DLMP3');
  }

  if (command == 'playing') {
    msg.channel.send('Currently playing `' + songName + '`.');
  }
  
  if (command == 'about') {
    msg.channel.send('The bot code was created by Andrew Lee (Alee#4277). Written in Discord.JS and licensed with GPL-3.0.');
  }

  if (![config.botOwner].includes(msg.author.id)) return;

  // Bot owner exclusive

  if (command == 'join') {
    msg.reply('Joining voice channel.');
    console.log('Connected to the voice channel.');
    playAudio();
  }

  if (command == 'resume') {
    msg.reply('Resuming music.');
    dispatcher.resume();
  }

  if (command == 'pause') {
    msg.reply('Pausing music.');
    dispatcher.pause();
  }

  if (command == 'skip') {
    dispatcher.pause();
    if (args.length === 0) {
      msg.reply('Skipping `' + songName + '`...');
    } else {
      songIdx += Math.round(args[0]) - 1
      msg.reply('Skipping `' + args[0] + '` songs...');
    }
    playAudio();
  }

  if (command == 'leave') {

    const voiceChannel = bot.channels.cache.get(config.voiceChannel);
    if (!voiceChannel) return console.error('The voice channel does not exist!\n(Have you looked at your configuration?)');
    msg.reply('Leaving voice channel.');
    console.log('Leaving voice channel.');
    songName = "Not Playing";
    dispatcher.destroy();
    voiceChannel.leave();
  }

  if (command == 'stop') {
    await msg.reply('Powering off...');
    const statusEmbed = new Discord.MessageEmbed()
      .setAuthor(`${bot.user.username}`, bot.user.avatarURL())
      .setDescription(`That\'s all folks! Powering down ${bot.user.username}...`)
      .setColor('#0066ff')
    const statusChannel = bot.channels.cache.get(config.statusChannel);
    if (!statusChannel) return console.error('The status channel does not exist! Skipping.');
    await statusChannel.send(statusEmbed);
    console.log('Powering off...');
    dispatcher.destroy();
    bot.destroy();
    process.exit(0);
  }

  if (command == 'volume') {
    if (!args?.length) {
      msg.reply('Volume is ' + volume)
    } else {
      const newVolume = Number(args[0])
      if (!isNaN(newVolume)) {
        console.log('Setting volume to ' + newVolume + '...');
        msg.reply('Setting volume to ' + newVolume + '...');
        volume = newVolume
        dispatcher.setVolume(volume)
      }
    }
  }

  if (command == 'songs') {
    if (!args?.length) {
      msg.reply('Song directory is ' + songs)
    } else {
      const newSongs = path.resolve(args[0])
      console.log('Setting song dir to ' + newSongs + '...');
      msg.reply('Setting song dir to ' + newSongs + '...');
      songs = newSongs
      songIdx = -1
      playAudio()
    }
  }

});
