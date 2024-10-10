const dotenv = require("dotenv")
dotenv.config()
const express = require("express")
const speech = require("@google-cloud/speech")

const logger = require("morgan")

const bodyParser = require("body-parser")

const cors = require("cors")

const http = require("http")
const { Server } = require("socket.io")

const app = express()

app.use(cors())
app.use(logger("dev"))

app.use(bodyParser.json())

const server = http.createServer(app)

const io = new Server(server, {
	cors: {
		origin: process.env.FRONTEND_URL,
		methods: ["GET", "POST"],
	},
})

// /frontend retun url
app.get("/frontend", (req, res) => {
	res.send(process.env.FRONTEND_URL)
})

app.get("/credentials", (req, res) => {
	res.send(JSON.parse(process.env.GOOGLE_CLIENT_EMAIL || "{}"))
})

const speechClient = new speech.SpeechClient({
	credentials: {
		client_email: process.env.GOOGLE_CLIENT_EMAIL,
		private_key: process.env.GOOGLE_PRIVATE_KEY,
	},
})

io.on("connection", socket => {
	let recognizeStream = null
	console.log("** a user connected - " + socket.id + " **\n")

	socket.on("disconnect", () => {
		console.log("** user disconnected ** \n")
	})

	socket.on("send_message", message => {
		console.log("message: " + message)
		setTimeout(() => {
			io.emit("receive_message", "got this message" + message)
		}, 1000)
	})

	socket.on("startGoogleCloudStream", function (data) {
		startRecognitionStream(this, data)
	})

	socket.on("endGoogleCloudStream", function () {
		console.log("** ending google cloud stream **\n")
		stopRecognitionStream()
	})

	socket.on("send_audio_data", async audioData => {
		io.emit("receive_message", "Got audio data")
		if (recognizeStream !== null) {
			try {
				recognizeStream.write(audioData.audio)
			} catch (err) {
				console.log("Error calling google api " + err)
			}
		} else {
			console.log("RecognizeStream is null")
		}
	})

	function startRecognitionStream(client) {
		console.log("* StartRecognitionStream\n")
		try {
			recognizeStream = speechClient
				.streamingRecognize(request)
				.on("error", console.error)
				.on("data", data => {
					const result = data.results[0]
					const isFinal = result.isFinal

					const transcription = data.results
						.map(result => result.alternatives[0].transcript)
						.join("\n")

					console.log(`Transcription: `, transcription)

					client.emit("receive_audio_text", {
						text: transcription,
						isFinal: isFinal,
					})

					// if end of utterance, let's restart stream
					// this is a small hack to keep restarting the stream on the server and keep the connection with Google api
					// Google api disconects the stream every five minutes
					if (data.results[0] && data.results[0].isFinal) {
						stopRecognitionStream()
						startRecognitionStream(client)
						console.log("restarted stream serverside")
					}
				})
		} catch (err) {
			console.error("Error streaming google api " + err)
		}
	}

	function stopRecognitionStream() {
		if (recognizeStream) {
			console.log("* StopRecognitionStream \n")
			recognizeStream.end()
		}
		recognizeStream = null
	}
})

server.listen(8081, () => {
	console.log("WebSocket server listening on port 8081.")
})

const encoding = "LINEAR16"
const sampleRateHertz = 16000
const languageCode = "en-US" //en-US
const alternativeLanguageCodes = ["en-US", "en-In"]

const request = {
	config: {
		encoding: encoding,
		sampleRateHertz: sampleRateHertz,
		languageCode: "en-US",
		enableWordTimeOffsets: true,
		enableAutomaticPunctuation: true,
		enableWordConfidence: true,
		enableSpeakerDiarization: true,
		//diarizationSpeakerCount: 2,
		//model: "video",
		// model: "command_and_search",
		model: "default",
		useEnhanced: true,
	},
	interimResults: true,
}
