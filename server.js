require("dotenv").config()
const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const speech = require("@google-cloud/speech")
const cors = require("cors")

const app = express()
app.use(cors())

const server = http.createServer(app)
const io = new Server(server, {
	cors: {
		origin: "http://localhost:3000",
		methods: ["GET", "POST"],
	},
})

const speechClient = new speech.SpeechClient({
	keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
})

const request = {
	config: {
		encoding: "LINEAR16",
		sampleRateHertz: 16000,
		languageCode: "en-US",
		enableWordTimeOffsets: true,
		enableAutomaticPunctuation: true,
		enableWordConfidence: true,
		enableSpeakerDiarization: true,
		useEnhanced: true,
		model: "command_and_search",
	},
	interimResults: true,
}

io.on("connection", socket => {
	console.log("** a user connected - " + socket.id + " **\n")

	let recognizeStream = null

	socket.on("disconnect", () => {
		console.log("** user disconnected **\n")
	})

	socket.on("send_message", message => {
		console.log("message: " + message)
		setTimeout(() => {
			socket.emit("receive_message", "got this message: " + message)
		}, 1000)
	})

	socket.on("startGoogleCloudStream", () => {
		startRecognitionStream(socket)
	})

	socket.on("endGoogleCloudStream", () => {
		console.log("** ending google cloud stream **\n")
		stopRecognitionStream()
	})

	socket.on("send_audio_data", async audioData => {
		socket.emit("receive_message", "Got audio data")
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

					if (data.results[0]?.isFinal) {
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

const PORT = process.env.PORT || 8081
server.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`)
})
