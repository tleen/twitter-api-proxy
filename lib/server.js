#!/usr/bin/env node
"use strict";

var express = require('express'),
fs = require('fs-extra'),
log = require('log'),
moment = require('moment'),
os = require('os'),
path = require('path'),
program = require('commander'),
querystring = require('querystring'),
S = require('string'),
twitter = require('twitter-api'),
_ = require('underscore');


var defaultCacheDir = path.join(os.tmpdir(),'twitter-api-proxy');

// setup options and logging
program
  .version('0.0.1')
  .option('-c, --cache-directory [' + defaultCacheDir + ']', 'Webserver local twitter data file cache [' + defaultCacheDir + ']', defaultCacheDir)
  .option('-d, --cache-duration [7d]', 'Cache file duration [7d]', '7d')
  .option('-h, --hostname [*all]', 'Webserver local listening address [*all]')
  .option('-l, --log-level [level]', 'Log at [level] level [error]', 'error')
  .option('-p, --port [number]', 'Webserver port [8080]', parseInt, 8080)
  .option('-t, --twitter-auth [file]', 'File with twitter authentication information [./twitter.json]', './.twitter.json')
  .parse(process.argv);

var logger = new log(program.logLevel);
logger.info('twitter auth file [%s]', program.twitterAuth);
logger.debug('cacheDir [%s]', program.cacheDirectory);

// I don't love this but its a quick/dirty create of cache duration using moment's nice date add format
// parse cache duration as [integer][unit] via http://momentjs.com/docs/#/manipulating/add/ shorthand
var durations = /^([\d]+)([\w]+)/.exec(program.cacheDuration);
var invalidateSeconds = moment(0).add(durations[2],durations[1]).unix();
logger.debug('cache invalidates in [%d] seconds', invalidateSeconds);



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

// instantiate server only after this succeeds?
client.get( 'account/verify_credentials', { skip_status: true }, function( user, error, status ){
  if(error){
    logger.emergency('unable to authenticate to twitter : ', error);
    process.exit(1);
  }else logger.info('authenticated at Twitter as @%s',user.screen_name);
});

logger.debug('Express starting on [%j:%j]', program.hostname, program.port);

var server = express();

// right now all we implement are the suggestions and user timeline

server.get('/users/suggestions/:slug', function(req, res){
  logger.debug('users suggestions request w/ %s', req.params.slug);
  cachePass(req, res, 'users/suggestions/' + req.params.slug,{
    include_entities : true
  });
});

server.get('/statuses/user_timeline', function(req, res){
  logger.debug('user timeline request');
  cachePass(req, res, 'statuses/user_timeline',req.query);
});

server.use(express.bodyParser());

server.listen(program.port, program.hostname);

function cachePass(req, res, url, args){
  // if cache file & cache file within cache time, return it
  // else pass request to twitter and cache in cacheFile

  var argsString = (args ? querystring.stringify(args) : '');
  var cacheFilename = path.join(program.cacheDirectory,S(url + argsString).slugify().ensureRight('.json').s);
  logger.debug('cachePass on url [%s] via file [%s]', url, cacheFilename);

  //reach cache

  fs.readJson(cacheFilename, function(err, saved){

    var now = moment().unix();
    var valid = (saved && saved._cached && ( (now - saved._cached) < invalidateSeconds));
    // do something abuot pruning existing files that are invalid
    if(!saved) logger.debug('no datafile for ', cacheFilename);

    if(err) logger.debug('error reading cache file [%s] : %j', cacheFilename, err);
    if(!valid) logger.debug('cache file invalid [%s]', cacheFilename);
      // regenerate file
      // pass url to twitter api and cache results if valid
    if(err || (!valid)){
      client.get(url, args, function(data, err, status){
	logger.debug('twitter request [%s] status[%d]', url, status);
	if(err){
	  logger.debug('error requesting [%s] : %j', url, err);
	  return res.send(err, status);
	}else{
	  // wrap it in a object storing the cache meta-data
	  var saved = {
	    _cached : moment().unix(),
	    data : data};
	  fs.outputJson(cacheFilename, saved, function(err){
	    if(err) logger.error('Unable to write cache file [%s]', cacheFilename);
	  });
	  return res.json(data);
	}
      });
    }else{
      logger.debug('returning cached data @ [%s]', cacheFilename);
      return res.json(saved.data);
    }
  });
}

