#!/usr/bin/env node
"use strict";

var express = require('express'),
fs = require('fs-extra'),
log = require('log'),
program = require('commander'),
twitter = require('twitter-api'),
_ = require('underscore');


// setup options and logging
program
  .version('0.0.1')
  .option('-l, --log-level [level]', 'Log at [level] level [error]', 'error')
  .option('-t, --twitter-auth [file]', 'File with twitter authentication information [./twitter.json]', './.twitter.json')
  .parse(process.argv);

var logger = new log(program.logLevel);
logger.info('twitter auth file [%s]', program.twitterAuth);


// read in twitter credentials, create client and  attempt basic authorization
// no error callback available on two methods in this block :(
try{
  var twitterAuth = fs.readJsonSync(program.twitterAuth); // no err
  logger.debug('twitter auth info:',twitterAuth);

  var client = twitter.createClient();

  client.setAuth( //no err
    twitterAuth.consumerKey,
    twitterAuth.consumerSecret,
    twitterAuth.accessKey,
    twitterAuth.accessSecret
  );
}catch(e){
  logger.emergency('unable to set twitter authentication information : ', e);
  process.exit(1);
}

client.get( 'account/verify_credentials', { skip_status: true }, function( user, error, status ){
  if(error){
    logger.emergency('unable to authenticate to twitter : ', error);
    process.exit(1);
  }else logger.info('authenticated at Twitter as @%s',user.screen_name);
});

// xx - setup express server

