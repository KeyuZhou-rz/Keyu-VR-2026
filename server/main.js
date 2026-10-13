var bodyParser = require("body-parser");
var express = require("express");
var formidable = require("formidable");
var fs = require("fs");
var http = require("http");
var path = require("path");
var fetch = require("node-fetch");
require('dotenv').config();

// behave as a relay

const holojam = require('holojam-node')(['relay']);

var ttDgram = require('dgram');
var ttServer = ttDgram.createSocket('udp4');
ttServer.on('listening', function () { });
ttServer.on('message', function (message, remote) { ttData.push(message); });
ttServer.bind(9090, '127.0.0.1');
ttData = [];


const { spawn } = require('child_process');

var gbr = 0;
var gbp = [];

var qrangle = [];
var qrdist = -1;

var objinfo = {};

var trackInfo = {};
trackInfo["1"] = [0,0,0,0,0,0,0];
trackInfo["2"] = [0,0,0,0,0,0,0];
trackInfo["3"] = [0,0,0,0,0,0,0];
trackInfo["4"] = [0,0,0,0,0,0,0];

var trackMessage = "";

var pendingAIQueries = new Map();
var openAISharedState = {
   outgoingMessage: "",
   incomingMessage: "",
   lastQueryId: null,
   lastModel: "gpt-5.1",
   lastError: ""
};

var app = express();
var port = process.argv[2] || 8000;
var wsPort = process.argv[3] || 22346;

// serve static files from main directory
app.use(express.static("./"));

// handle uploaded files
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Add raw body parser for speech endpoint
app.use('/api/wit/speech', bodyParser.raw({ type: 'audio/raw', limit: '10mb' }));
app.route("/upload").post(function(req, res, next) {
   var form = new formidable.IncomingForm();
   form.uploadDir = "./sketches";
   form.keepExtensions = true;

   form.parse(req, function(err, fields, files) {
      res.writeHead(200, {"content-type": "text/plain"});
      res.write('received upload:\n\n');

      var filename = fields.sketchName;
      var suffix = ".js";
      if (filename.indexOf(suffix, filename.length - suffix.length) == -1)
         filename += suffix;

      fs.writeFile(form.uploadDir + "/" + filename, fields.sketchContent, function(err) {
         if (err) {
            console.log(err);
         } else {
            //console.log("file written");
         }
      });

      res.end();
   });
});

// log endpoint
app.route("/log").post(function(req, res, next) {
   var form = new formidable.IncomingForm();
   form.parse(req, function(err, fields, files) {
      console.log(fields.log);
      res.end();
   });
});

app.route("/getTT").post(function(req, res, next) {
   var form = new formidable.IncomingForm();
   form.parse(req, function(err, fields, files) {
      if (ttData.length > 0) {
         returnString(res, ttData[0]);
         ttData = [];
      }
   });
});

app.route("/set").post(function(req, res, next) {
   var form = new formidable.IncomingForm();
   form.parse(req, function(err, fields, files) {

      res.writeHead(200, {"content-type": "text/plain"});
      res.write('received upload:\n\n');

      var key = fields.key.toString();
      if (! key.endsWith('.json') && ! key.endsWith('.txt'))
         key += '.json';
/*
      if (fields.value[0].toString().startsWith('[')) {
         res.end();
         return;
      }
*/
try {
//    fs.writeFile(key, fields.value[0], function(err) {
      fs.writeFile(key, fields.value, function(err) {
         if (err) {
            console.log(err);
         }
         else {
            //console.log("file written");
         }
      });
} catch(e) { console.log('FS.WRITEFILE ERROR', key, fields.value); }

      res.end();
   });
});

// opti-track

let pack = (array, lo, hi) => {
   if (lo === undefined) { lo = 0; hi = 1; } else if (hi === undefined) { hi = lo ; lo = 0; }
   let C = " !#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~";
   let pack = t => C[92 * t >> 0] + C[92 * (92 * t % 1) + .5 >> 0];
   let s = '';
   for (let n = 0 ; n < array.length ; n++)
      s += pack((array[n] - lo) / (hi - lo));
   return s;
}

app.route("/opti-track-external").put(function (req, res) {
   req.on('data', d => {
      trackMessage = d.toString('utf8');
      //console.log(trackMessage);
   });

   res.end();
});

app.route("/opti-track").get(function (req, res) {
   res.send(trackMessage);
});

app.route("/spawnPythonThread").post(function(req, res) {
   var form = new formidable.IncomingForm();
   form.parse(req, function(err, fields, files) {
      var fileName = fields.fileName;
      var input = fields.input;
      const python = spawn('python3',['python/'+fileName, input]);

      console.log('python/'+fileName);
      console.log(input);

      python.stdout.on('data',function (data) {
         res.send(data.toString());
      });

      python.on('close',(code) => {
         console.log('closed');
      })
   });
});

app.route("/greenball-python").post(function (req, res) {
   gbr = req.body.radius;
   gbp = req.body.position;
   res.end();
});

app.route("/greenball").post(function (req, res) {
   var info = {};
   info['radius'] = gbr;
   info['position'] = gbp;
   res.send(info);
});

app.route("/qrcode-python").post(function (req, res) {
   qrangle = req.body.angle;
   qrdist = req.body.distance;
   res.end();
});

app.route("/qrcode").post(function (req, res) {
   var info = {};
   info['angle'] = qrangle;
   info['dist'] = qrdist;
   res.send(info);
});

app.route("/obj-python").post(function (req, res) {
   objinfo = req.body;
   res.end();
});

app.route("/obj").post(function (req, res) {
   res.send(objinfo);
});


app.route("/writeFile").post(function(req, res, next) {
   var form = new formidable.IncomingForm();
   form.parse(req, function(err, fields, files) {
      fs.writeFile(fields.fileName, JSON.parse(fields.contents),
         function(err) { if (err) console.log(err); }
      );
      res.end();
   });
});

app.route("/talk").get(function(req, res) {
   res.sendfile("index.html");
});

app.route("/listen").get(function(req, res) {
   res.sendfile("index.html");
});

var time = 0;

// handle request for the current time
app.route("/getTime").get(function(req, res) {
   time = (new Date()).getTime();
   returnString(res, '' + time);
});

// handle request for list of available sketches
app.route("/ls_sketches").get(function(req, res) {
   readDir(res, "sketches", ".js");
});

// handle request for list of available sketch libraries
app.route("/ls_sketchlibs").get(function(req, res) {
   readDir(res, "sketchlibs", ".js");
});

// handle request for list of available images
app.route("/ls_images").get(function(req, res) {
   readDir(res, "images");
});

// handle request for list of state files
app.route("/ls_state").get(function(req, res) {
   readDir(res, "state");
});

function returnString(res, str) {
   res.writeHead(200, { "Content-Type": "text/plain" });
   res.write(str + "\n");
   res.end();
};

function readDir(res, dirName, extension) {
   fs.readdir("./" + dirName + "/", function(err, files) {
      if (err) {
         if (err.code === "ENOENT") {
            // Directory not found, return empty string
            res.writeHead(200, { "Content-Type": "text/plain" });
         }
         else {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.write(err.message);
            console.log("error listing the " + dirName + " directory" + err);
         }
         res.end();
         return;
      }

      res.writeHead(200, { "Content-Type": "text/plain" });
      for (var i = 0; i < files.length; i++) {
         if (!extension || files[i].toLowerCase().endsWith(extension.toLowerCase())) {
            res.write(files[i] + "\n");
         }
      }
      res.end();
   });
}

String.prototype.endsWith = function(suffix) {
   return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

String.prototype.contains = function(substr) {
   return this.indexOf(substr) > -1;
};

function readHeader(data) {
   let header = data.toString('ascii', 1, 2);
   header += data.toString('ascii', 0, 1);
   header += data.toString('ascii', 3, 4);
   header += data.toString('ascii', 2, 3);
   header += data.toString('ascii', 5, 6);
   header += data.toString('ascii', 4, 5);
   header += data.toString('ascii', 7, 8);
   header += data.toString('ascii', 6, 7);
   return header;
}

// IF SECURE, CREATE AN HTTPS SERVER
if (process.argv[4] == 'https') {
   var https = require('https');
   var fs = require('fs');
   var options = {
      key: fs.readFileSync('key.key'),
      cert: fs.readFileSync('cert.cer')
   };
   var server = https.createServer(options, app);
} 
// ELSE CREATE AN HTTP SERVER
else
   var server = http.Server(app);

// WEBSOCKET ENDPOINT SETUP
try {
   var WebSocketServer = require("ws").Server;

   var wss = new WebSocketServer({ server: server });
   var websockets = [];
   var clients = [];

   wss.on("connection", function(ws) {

      ws.index = websockets.length;
      for (let n = 0 ; n < websockets.length ; n++)
         if (websockets[n] == null)
	    ws.index = n;
      websockets[ws.index] = ws;
      clients.push(ws.index);

      let sendClients = () => {
         let data = JSON.stringify({ global: "clients", value: clients });
         for (var index = 0 ; index < websockets.length ; index++)
            if (websockets[index])
               websockets[index].send(data);
      }
      sendClients();

      ws.on("message", data => {
         for (var index = 0 ; index < websockets.length ; index++)
            if (websockets[index] && index != ws.index)
               websockets[index].send(data);
	 if (readHeader(data) == 'CTdata01') {
	    holojam.Send(holojam.BuildUpdate('ChalkTalk', [{
	       label: 'Display',
	       bytes: data
	    }]));
	 }
      });

      ws.on("close", function() {
         websockets[ws.index] = null;        // REMOVE THIS WEBSOCKET
	 for (let n = 0 ; n < clients.length ; n++)
	    if (clients[n] == ws.index)
	       clients.splice(n--, 1);
	 sendClients();
      });
   });
} catch (err) {
   console.log("\x1b[31mCouldn't load websocket library. Disabling event broadcasting."
         + " Please run 'npm install' from Chalktalk's server directory\x1b[0m");
	console.log(err);
}

// START THE HTTP OR HTTPS SERVER
server.listen(parseInt(port, 10), function() {
   let mode = process.argv[4] == 'https' ? 'HTTPS' : 'HTTP';
   console.log(mode + " server listening on port %d", server.address().port);

   /*let pyshell = new PythonShell('test.py');
    
   pyshell.on('message', function (message) {
      trackMessage = message;
   });

   pyshell.end(function (err, code, signal) {
      if (err) throw err;
      console.log('The exit code was: ' + code);
      console.log('The exit signal was: ' + signal);
      console.log('finished');
   });*/
});

const io = require("socket.io")(server);

io.on('connection', (socket) => {
	console.log("Got connection!");
	
	socket.on('Event', (data) => {
		console.log("Received test Event " + data);
	});
	
	soc = socket;
	socket.emit("Event", "Sending");
});

/*
// Debug
holojam.on('tick', (a, b) => {
  console.log('VR: [ ' + a[0] + ' in, ' + b[0] + ' out ]');
});
*/

app.route("/api/aiquery").post(function(req, res) {
   const { query, queryId, model, messages, tools, tool_choice, parallel_tool_calls, response_format, provider, max_tokens } = req.body;
   const isDeepSeek = provider === 'deepseek';
   const apiBase = isDeepSeek ? 'https://api.deepseek.com' : 'https://api.openai.com/v1';
   const defaultModel = isDeepSeek ? (process.env.DEEPSEEK_MODEL || 'deepseek-flash') : 'gpt-5.1';
   const hasMessages = Array.isArray(messages) && messages.length > 0;
   const queryText = ((typeof query === "string" ? query : openAISharedState.outgoingMessage) || "").trim();

   if (!hasMessages && !queryText) {
      return res.status(400).json({ error: "Query text or messages are required" });
   }

   openAISharedState.outgoingMessage = hasMessages
      ? ((messages[messages.length - 1] && messages[messages.length - 1].content) || "[messages]")
      : queryText;
   openAISharedState.lastQueryId = queryId === undefined ? null : queryId;
   openAISharedState.lastModel = model || defaultModel;
   openAISharedState.lastError = "";

   console.log(`[AI] outgoingMessage: ${openAISharedState.outgoingMessage}`);
   
   const apiKey = isDeepSeek ? process.env.DEEPSEEK_API_KEY : process.env.OPENAI_API_KEY;
   if (!apiKey) {
      const keyName = isDeepSeek ? 'DEEPSEEK_API_KEY' : 'OPENAI_API_KEY';
      openAISharedState.lastError = `${keyName} not configured`;
      return res.status(500).json({ 
         error: openAISharedState.lastError,
         details: `Add ${keyName} to your .env file`,
         state: openAISharedState
      });
   }
   
   const defaultSystem = "You are a helpful assistant in a WebXR environment. Provide concise, informative responses.";
   const modelToUse = openAISharedState.lastModel;
   const useResponses = !isDeepSeek && /-codex\\b/i.test(modelToUse);
   const controller = isDeepSeek ? new AbortController() : null;
   const timeout = isDeepSeek ? setTimeout(() => controller.abort(), 8000) : null;
   if (controller) res.on('close', () => controller.abort());

   const sendSuccess = (responseText, message) => {
      openAISharedState.incomingMessage = responseText;
      res.json({
         queryId: queryId,
         response: responseText,
         message: message || { content: responseText },
         state: openAISharedState
      });
      console.log(`[AI] incomingMessage: ${responseText}`);
   };

   const sendFailure = error => {
      if (res.destroyed) return;
      console.error('Error calling AI API:', error.message);
      openAISharedState.lastError = error.message;
      res.status(500).json({
         error: "Error processing AI query",
         details: error.message,
         state: openAISharedState
      });
   };

   const callChatCompletions = () => {
      const requestMessages = hasMessages ? messages : [
         { role: "system", content: defaultSystem },
         { role: "user", content: queryText }
      ];

      const requestBody = {
         model: modelToUse,
         messages: requestMessages
      };
      if (isDeepSeek) requestBody.thinking = { type: 'disabled' };
      if (max_tokens !== undefined) requestBody.max_tokens = max_tokens;
      if (tools) requestBody.tools = tools;
      if (tool_choice) requestBody.tool_choice = tool_choice;
      if (!isDeepSeek && parallel_tool_calls !== undefined) requestBody.parallel_tool_calls = parallel_tool_calls;
      if (response_format) requestBody.response_format = response_format;

      return fetch(apiBase + '/chat/completions', {
         method: 'POST',
         signal: controller?.signal,
         headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
         },
         body: JSON.stringify(requestBody)
      })
      .then(async response => {
         const data = await response.json();
         if (!response.ok) {
            throw new Error(data.error?.message || `AI API error: ${response.status} ${response.statusText}`);
         }
         return data;
      })
      .then(data => {
         const message = (data.choices && data.choices[0] && data.choices[0].message) ? data.choices[0].message : {};
         const responseText = message.content || "";
         return { responseText, message };
      });
   };

   const callResponses = () => {
      const systemMessages = hasMessages
         ? messages.filter(m => m && m.role === "system" && typeof m.content === "string")
         : [];
      const instructions = systemMessages.length ? systemMessages.map(m => m.content).join("\\n") : defaultSystem;

      const input = [];
      if (hasMessages) {
         for (const msg of messages) {
            if (!msg || !msg.role) continue;
            if (msg.role === "system") continue;
            if (msg.role === "tool") {
               if (msg.tool_call_id) {
                  input.push({
                     type: "function_call_output",
                     call_id: msg.tool_call_id,
                     output: msg.content || ""
                  });
               }
               continue;
            }
            if (msg.role === "assistant" && Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
               if (msg.content) {
                  input.push({ role: "assistant", content: msg.content });
               }
               for (const tc of msg.tool_calls) {
                  const fn = tc.function || {};
                  input.push({
                     type: "function_call",
                     name: fn.name || tc.name,
                     arguments: fn.arguments || tc.arguments || "{}",
                     call_id: tc.id || tc.call_id
                  });
               }
               continue;
            }
            if (typeof msg.content === "string") {
               input.push({ role: msg.role, content: msg.content });
            }
         }
      } else if (queryText) {
         input.push({ role: "user", content: queryText });
      }

      const requestBody = {
         model: modelToUse,
         instructions: instructions,
         input: input
      };
      if (tools) requestBody.tools = tools;
      if (tool_choice) requestBody.tool_choice = tool_choice;
      if (parallel_tool_calls !== undefined) requestBody.parallel_tool_calls = parallel_tool_calls;
      if (response_format) requestBody.text = { format: response_format };

      return fetch('https://api.openai.com/v1/responses', {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
         },
         body: JSON.stringify(requestBody)
      })
      .then(response => {
         if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
         }
         return response.json();
      })
      .then(data => {
         const output = Array.isArray(data.output) ? data.output : [];
         let responseText = "";
         const toolCalls = [];

         for (const item of output) {
            if (item && item.type === "message" && Array.isArray(item.content)) {
               for (const part of item.content) {
                  if (part && part.type === "output_text" && typeof part.text === "string") {
                     responseText += part.text;
                  }
               }
            } else if (item && item.type === "function_call") {
               toolCalls.push({
                  id: item.call_id || item.id,
                  type: "function",
                  function: {
                     name: item.name,
                     arguments: item.arguments
                  }
               });
            }
         }

         const message = { content: responseText, tool_calls: toolCalls };
         return { responseText, message };
      });
   };

   const runner = useResponses ? callResponses : callChatCompletions;

   runner()
      .then(({ responseText, message }) => sendSuccess(responseText, message))
      .catch(sendFailure)
      .finally(() => clearTimeout(timeout));
});

app.route("/api/aiquery/state").get(function(req, res) {
   res.json(openAISharedState);
});

// Save a scene file (restricted to js/scenes/*.js)
app.route("/api/saveScene").post(function(req, res) {
   const { path: filePath, contents } = req.body || {};

   if (typeof filePath !== "string" || typeof contents !== "string") {
      return res.status(400).json({ error: "path and contents are required" });
   }

   const projectRoot = path.resolve(__dirname, "..");
   const allowedDir = path.resolve(projectRoot, "js", "scenes");
   const resolved = path.resolve(projectRoot, filePath);

   if (!resolved.startsWith(allowedDir + path.sep)) {
      return res.status(400).json({ error: "Invalid path (must be under js/scenes)" });
   }
   if (!resolved.endsWith(".js")) {
      return res.status(400).json({ error: "Invalid file type (must be .js)" });
   }

   fs.writeFile(resolved, contents, function(err) {
      if (err) {
         console.error("Failed to write scene file:", err);
         return res.status(500).json({ error: "Failed to write file", details: err.message });
      }
      res.json({ ok: true, path: filePath });
   });
});

app.route("/api/wit/speech").post(function(req, res) {
   const buffer = req.body;
   
   if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: "Audio buffer is required" });
   }
      
   const apiKey = process.env.WIT_API_KEY;
   if (!apiKey) {
      console.error('Wit.ai API key not found in .env file');
      return res.status(500).json({ 
         error: "Wit.ai API key not configured", 
         details: "Add WIT_API_KEY to your .env file"
      });
   }

    if (!apiKey) {
        console.error("WIT_API_KEY is not set");
        return;
    }
    fetch('https://api.wit.ai/speech', {
        method: 'POST',
        headers: {
            'content-type': 'audio/raw;encoding=floating-point;bits=32;rate=44100;endian=little',
            'authorization': `Bearer ${apiKey}`,
            // 'Transfer-Encoding': 'chunked',
        },
        body: buffer,
    }).then(response => {
         if (!response.ok) {
               console.error(`Wit.ai API error: ${response.status} ${response.statusText}`);
               return;
         }
         return response.text().then(text => {
            res.status(200).json({ response: text });
         });
      });
});
