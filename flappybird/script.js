// ==== Constants
const PLR_LEFT_OFFSET = 120
const TERMINAL_VELOCITY = 1000
const GROUND_HEIGHT = 125
const GRASS_SIZE = 15
const GRAVITY = 1750
const JUMP_STRENGTH = 500

const PLR_WIDTH = 40
const PLR_HEIGHT = 30
const PLR_LENIENCY = 10 // how much is the player's hitbox shrunk by. Both sides, so doubled.
const PLR_SPRITESIZE = 40

const PIPE_BASE_SPEED = 250
const PIPE_SCORE_ACCEL = 1
const PIPE_SCORE_TIMESUB = 0.01
const PIPE_SCORE_MAX = 135
const PIPE_OSCILLATE_FROM = 250
const PIPE_OSCILLATE_MAX = 500
const PIPE_OSCILLATE_STRENGTH = 0.2
const PIPE_OSCILLATE_DISTANCEMOD = 0.01

const PIPE_WIDTH = 55
const PIPE_GAP = 130
const PIPE_SPAWN_TIME = 2
const SHAKE_EVERY = 0.04
const EDGE_PADDING = 175 // distance between top/bottom. Bottom has GROUND_HEIGHT additionally.

const CLOUD_SPAWN_EVERY_MIN = 0.2
const CLOUD_SPAWN_EVERY_MAX = 1
const CLOUD_MIN_SCALE = 0.25
const CLOUD_PARALLAX_STRENGTH = PIPE_BASE_SPEED / 1.2
const CLOUD_SECRET_CHANCE = 0.025

const CAMSHAKE_STRENGTH = 12

// let so you can change in browser console
let DEBUG_SPAWN_ALWAYS = false
let DEBUG_GODMODE = false
let DEBUG_CLOSESPAWN = false
let DEBUG_DRAW_HITBOXES = false
let DEBUG_SHOW_NEGATIVE_CHECKPOINTS = false

const ENDSCREEN_DELAY = 2000
const ENDSCREEN_DELAY_GROUND = 1250
const ENDSCREEN_COUNTER_DELAY = 500
const ENDSCREEN_COUNTER_TIMER = 40
const ENDSCREEN_HIGHSCORE_DELAY = 500

const asset = {
	"sfx": {
		"gameover": document.getElementById("snd_gameover"),
		"land": document.getElementById("snd_land"),
		"jump": document.getElementById("snd_jump"),
		"scored": document.getElementById("snd_scored"),
		"counter": document.getElementById("snd_counter"),
	},
	"img": {
		"player": document.getElementById("img_player"),
		"pipe": document.getElementById("img_pipe"),
		"cloud": document.getElementById("img_cloud")
	}
}; Object.freeze(asset)

// Only for sprites that show up multiple times, like clouds and pipes.
const sprites = {}

/*** @type {[key: number]: number} */
const checkpoints = { // start, high score requirement
	[-5000]: 0,
	0: 0,
	25: 50,
	50: 100,
	100: 250,
	200: 500,
}; Object.freeze(checkpoints)

// TODO: Move into sprites
// Loaded from img/player_anim.json, this only serves as a fallback. (and documentation for the in-memory format, not the json one)

// ===== Game State
let gameTime = 0
let gameTime_raw = 0

let startedOn = 0

let camX = 0
let camY = 0

let el_score = document.getElementById("scoredisplay")
let el_startfrom = document.getElementById("startfrom_display")

let el_startscreen = document.getElementById("startscreen")
let el_startscreen_highscore = document.getElementById("start_highscore")
let el_startscreen_startfrom = document.getElementById("startfrom_list")

let el_endscreen = document.getElementById("endscreen")
let el_endscreen_score = document.getElementById("endscreen_score")
let el_endscreen_highscore = document.getElementById("endscreen_highscore")
let el_endscreen_startfrom = document.getElementById("endscreen_startfrom")

let el_loadingscreen = document.getElementById("loadingscreen")
let el_loadingscreen_text = document.getElementById("loadingtext")

let el_pause = document.getElementById("pausescreen")
let el_pausebtn = document.getElementById("pausebutton")

let updateShakeAfter = 0

/*** @typedef Pipe @property {number} x @property {number} y*/

/*** @type Pipe[] */
let pipes = []


/*** @typedef Cloud @property {number} x @property {number} y @property {number} depth @property {SpriteData} sprite */

/*** @type Cloud[] */
let clouds = []

let game = {
	"started": false, // player stays around the center. Death is handled by player.dead
	"score": 0,
	"deadFor": 0
}

let prevHighScore = 0
let highScore = 0

let timeScale = 1
let paused = false

let pipeTimer = PIPE_SPAWN_TIME
let cloudTimer = CLOUD_SPAWN_EVERY_MIN
let whiteout = 0
let shakeFor = 0

// putting this in a class since this ended up used in multiple places.
class Spritesheet {
	/*** @typedef SpriteData @property {number} width @property {number} height @property {number} scale @property {[key: string]: Anim} animations */

	/*** @typedef Frame @property {number} x @property {number} y @property {number} duration */
    /*** @typedef Anim @property {boolean} loop @property {Frame[]} frames */

	/*** @type SpriteData */
	static DEFAULT_SPRITEDATA = {
		"width": 1,
		"height": 1,
		"scale": 1,
		"animations": {
			"default": {"loop": false, "frames": [{"x": 0, "y": 0, "duration": 1}]},
		}
	}
	
	/*** @param {SpriteData} spritedata @param {string} startanim */
	constructor(spritedata = Spritesheet.DEFAULT_SPRITEDATA, startanim = "default") {
		this.data = spritedata
		this._startanim = startanim // used for copy
		this.playAnim(startanim)
		Object.preventExtensions(this)
	}

	copy() {
		return new Spritesheet(this.data, this.startanim)
	}

	get width() {return this.data.width}
	get height() {return this.data.height}
	get scale() {return this.data.scale}
	
	playAnim(animname) {
		if (!this.data.animations[animname]) {
			throw new Error(`Animation '${animname}' doesn't exist.`)
		}

		this.curAnim = animname
		this.curFrame = 0
		this.frameSwitchedTime = gameTime
	}
	
	getSheetCoords() {
		let animdata = this.data.animations[this.curAnim]
		let framedata = animdata.frames[Math.min(this.curFrame, animdata.frames.length - 1)]

		return {"x": framedata.x, "y": framedata.y}
	}

	update(dt) {
		let animdata = this.data.animations[this.curAnim]
		let framedata = animdata.frames[Math.min(this.curFrame, animdata.frames.length - 1)]

		
		let frameHeldFor = gameTime - this.frameSwitchedTime

		if (frameHeldFor >= framedata.duration) {
			this.curFrame++
			if (animdata.loop == true) {
				this.curFrame %= animdata.frames.length
			}
			this.curFrame = Math.min(animdata.frames.length - 1, this.curFrame)
			this.frameSwitchedTime = gameTime
			
			if (animdata.next_animation) {
				if (typeof(animdata) == "string") {
					this.playAnim(animdata.next_animation)
				} else if (typeof(animdata) == "object") {
					this.playAnim(animdata.next_animation[Math.trunc(Math.random() * animdata.next_animation.length)])
				}
			}
		}
	}
}
const FALLBACK_SPRITESHEET = new Spritesheet()

let player = {
	"y": 0,
	"velocity": 0.0,
	"dead": false,
	"grounded": false,
	"anim": FALLBACK_SPRITESHEET, 
}

function shouldScroll() {
	return !player.dead && !paused
}

function shouldPipesSpawn() {
	return game.started && !player.dead && !paused
}
function canPlayerJump () {
	return !player.dead && !paused && player.y >= 0
}

function parseFloatStrict(val, errormsg) {
	let result = parseFloat(val)
	if (result == NaN || val == undefined) {
		throw new Error(errormsg == undefined ? "Value passed to parseFloatStrict isn't a number." : errormsg)
	}
	return result
}

function playSfx(sound, pitch) {
	if (!(sound instanceof HTMLAudioElement)) {
		throw new Error("Sound isnt an audio element!")
		return
	}

	if (pitch != undefined && pitch != null) {
		sound.playbackRate = pitch
	}
	sound.currentTime = 0
	sound.play()
}

// https://stackoverflow.com/a/43155027
// modified to add spritesheet capabilities
function drawImageCenter(ctx, image, x, y, cx, cy, scale, rotation, srcX, srcY, width, height) {
    let prevTransform = ctx.getTransform()

	//console.log(x, y, cx, cy, scale, rotation, srcX, srcY, width, height)
	
	ctx.transform(scale, 0, 0, scale, x, y); // sets scale and origin
    ctx.rotate(rotation);
	ctx.drawImage(image, srcX, srcY, width, height, -cx, -cy, width, height)
	ctx.setTransform(prevTransform)
}

function btn_pause() {
	if (!paused && !(player.dead || !game.started)) {
		el_pause.showPopover()
		paused = true
	} else {
		el_pause.hidePopover()
		el_pausebtn.blur()
		paused = false
	}
}

function jump() {
	player.velocity = -JUMP_STRENGTH
	playSfx(asset.sfx.jump, Math.random() * 0.2 + 0.9)
	player.anim.playAnim("flap")
}

function tap(x, y) {
	if (!canPlayerJump()) {
		return
	}

	game.started = true
	el_startscreen.style.visibility = "hidden"
	jump()
}

/*** @param {number} y */
/*** @returns {Pipe} */
function makePipe(y) {
	let x = canvas.width + PIPE_WIDTH
	if (DEBUG_CLOSESPAWN) {
		x -= canvas.width / 2
	}

	let pipe =  {
		"x": x,
		"y": y,
		"scored": false,
		"sprite": sprites.pipe.copy(),
	}
	pipes.push(pipe)
	return pipe
}

/*** @returns {Cloud} */
function makeCloud(x, y, depth) {
	let sprite = sprites.cloud.copy()
	let anims = Object.keys(sprite.data.animations)

	if (Math.random() < CLOUD_SECRET_CHANCE) {
		sprite.playAnim("secret")
	}

	/*** @type {Cloud} */
	let result = {
		"x": x,
		"y": y,
		"depth": depth,
		"sprite": sprite,
	}

	clouds.push(result)
	clouds.sort((a, b) => {
		return b.depth - a.depth
	})
	clouds = clouds.filter((c) => {
		return !(c.x <= -sprite.width * sprite.scale)
	})

	return result
}

let score_endVisual = 0
function showEndScreen() {
	if (!player.dead) {return}
	el_endscreen.showPopover()
	el_endscreen_score.innerText = 0
	el_endscreen_highscore.innerText = prevHighScore

	if (startedOn == 0) {
		el_endscreen_startfrom.innerText = "the beginning"
	} else {
		el_endscreen_startfrom.innerText = startedOn
	}
	
	score_endVisual = 0
	setTimeout(function() {
		incrementEndScore()
	}, ENDSCREEN_COUNTER_DELAY)
}

function incrementEndScore() {
	if (!player.dead) {return}
	
	score_endVisual += 1
	let cont = true

	if (startedOn < 0) {
		score_endVisual += Math.trunc(Math.random() * 200)
	}

	if (score_endVisual >= game.score + startedOn && !(startedOn < 0)) {
		score_endVisual = game.score + startedOn
		cont = false
		setTimeout(function() {
			if (game.score > prevHighScore) {
				playSfx(asset.sfx.scored)
			}
			el_endscreen_highscore.innerText = highScore
		}, ENDSCREEN_HIGHSCORE_DELAY)
	}

	el_endscreen_score.innerText = score_endVisual
	if (cont) {
		// playSfx(sfx_counter, 1, true)
		// Cannot be done without lagging, since too many sounds are playing at once.
		// (3rd argument was playing audio quickly by duplicating it. It caused too much lag so I removed it.)
		setTimeout(incrementEndScore, ENDSCREEN_COUNTER_TIMER)
	}
}

function setStartFrom(to) {
	startedOn = to

	el_startfrom.innerText = "+"+to
	el_startfrom.removeAttribute("x-notzero")
	if (to != 0) {
		el_startfrom.setAttribute("x-notzero", true)
	}

	sessionStorage.setItem("startOn", to)
}

function refreshStartFroms() {
	let els = el_startscreen_startfrom
	els.innerHTML = ""

	let startCheckbox = null
	let wasAnyChecked = false

	Object.keys(checkpoints).forEach((start) => {
		start = parseInt(start) // Thank you Javascript.
		let requirement = checkpoints[start]
		let id = `startfrom_${start}`

		let entry = document.createElement("input")
		entry.type = "radio"
		entry.name = "whichStart"
		entry.id = id

		let label = document.createElement("label")
		label.htmlFor = id
		if (start == 0) {
			label.innerText = "Beginning"
			startCheckbox = entry
		} else if (start < 0) {
			if (!DEBUG_SHOW_NEGATIVE_CHECKPOINTS) {return}
			label.innerText = `${start} 🥱😴😴😴`
		} else {
			label.innerText = `${start} (requires ${requirement}+)`
		}

		if (start == startedOn) {
			entry.checked = true
			wasAnyChecked = true
		}
		
		if (highScore >= requirement) {
			entry.onclick = () => {setStartFrom(start)}
		} else {
			entry.disabled = true
		}

		els.appendChild(entry)
		els.appendChild(label)
		els.appendChild(document.createElement("br"))
	})

	if (!wasAnyChecked && startCheckbox != null) {
		startCheckbox.checked = true
	}
}

function kill(launch, slowdown) {
	if (player.dead || DEBUG_GODMODE) {
		return
	}

	if (launch) {
		player.velocity = -JUMP_STRENGTH * 1.1
	} else {
		player.velocity = 0
	}
	player.dead = true

	if (slowdown) {
		timeScale = 0.2
		whiteout = 1
		shakeFor = 1.5
	} else {
		shakeFor = 0.5
		whiteout = 0.5
	}

	prevHighScore = highScore
	highScore = Math.max(game.score + startedOn, highScore)

	localStorage.setItem("highScore", highScore)

	playSfx(asset.sfx.gameover, 1)
	setTimeout(showEndScreen, slowdown ? ENDSCREEN_DELAY : ENDSCREEN_DELAY_GROUND)
}

function reset(_) {
	game.started = false
	game.score = 0
	game.deadFor = 0
	
	player.y = canvas.height / 2.0
	player.velocity = 0
	player.dead = false
	player.grounded = false

	player.anim.playAnim("default")

	el_score.innerText = game.score
	el_startscreen_highscore.innerText = highScore

	refreshStartFroms()

	pipes = []
	pipeTimer = 0
	el_endscreen.hidePopover()
	el_startscreen.style.visibility = "visible"
}

function update(dt, dtRaw, timestamp) {
	if (!(ctx instanceof CanvasRenderingContext2D)) {return} // making sure I get autocompletion.

	let dirty = false
	let fakeScore = game.score + startedOn

	let difficultyScore = Math.abs(Math.min(fakeScore, PIPE_SCORE_MAX))
	let oscillateStrength = Math.min(Math.max(0, fakeScore - PIPE_OSCILLATE_FROM) / (PIPE_OSCILLATE_MAX - PIPE_OSCILLATE_FROM), 1)

	let scrollSpeed = PIPE_BASE_SPEED + (difficultyScore * PIPE_SCORE_ACCEL)

	if (DEBUG_SPAWN_ALWAYS || shouldPipesSpawn()) {
		pipeTimer -= dt
		if (pipeTimer <= 0) {
			makePipe(Math.random() * (canvas.height - (EDGE_PADDING * 2) - GROUND_HEIGHT) + EDGE_PADDING)
			pipeTimer += PIPE_SPAWN_TIME - (PIPE_SCORE_TIMESUB * difficultyScore)
		}
	}

	// background
	ctx.fillStyle = "#67a9ff"
	ctx.fillRect(0, 0, canvas.width, canvas.height)
	ctx.fillStyle = "#569af3"
	ctx.fillRect(0, 0, canvas.width, canvas.height / 4)
	ctx.fillStyle = "#458eee"
	ctx.fillRect(0, 0, canvas.width, canvas.height / 8)

	// lower sky
	ctx.fillStyle = "#90bffc"
	ctx.fillRect(0, canvas.height - GROUND_HEIGHT - canvas.height / 8, canvas.width, canvas.height / 8 + camY)


	player.anim.update(dt)

	whiteout = Math.max(whiteout - 1.2 * dtRaw, 0)
	if (player.dead && timeScale < 1) {
		const add = (timeScale + 0.001) * 0.025
		timeScale = Math.min(1, timeScale + add)
	}

	if (!game.started) {
		if (player.y >= (canvas.height / 2) + (JUMP_STRENGTH / 8)) {
			jump()
		}
	}

	if (!player.grounded && !paused) {
		player.velocity += GRAVITY * dt
		player.velocity = Math.min(player.velocity, TERMINAL_VELOCITY)
		player.y += player.velocity * dt
	}

	if (shouldScroll()) {
		cloudTimer -= dt
		if (cloudTimer <= 0) {
			cloudTimer = Math.random() * (CLOUD_SPAWN_EVERY_MAX - CLOUD_SPAWN_EVERY_MIN) + CLOUD_SPAWN_EVERY_MIN
			makeCloud(canvas.width + 200, Math.random() * canvas.height / 2, Math.random())
		}
	}

	clouds.forEach((cloud) => {
		let depthInverted = 1 - cloud.depth
		
		if (shouldScroll()) {
			cloud.x -= (scrollSpeed - (CLOUD_PARALLAX_STRENGTH * cloud.depth)) * dt
		}

		cloud.sprite.update(dt)

		let scale = cloud.sprite.scale * (depthInverted * (1 - CLOUD_MIN_SCALE) + CLOUD_MIN_SCALE)
		
		let sheetPos = cloud.sprite.getSheetCoords()
		drawImageCenter(ctx, asset.img.cloud,
			cloud.x + camX * depthInverted, cloud.y + camY * depthInverted, cloud.sprite.width / 2, cloud.sprite.height / 2, scale, 0,
			sheetPos.x, sheetPos.y, cloud.sprite.width, cloud.sprite.height,
		)
		//ctx.fillText(scale, cloud.x, cloud.y)
	})

	shakeFor -= dtRaw
	if (shakeFor > 0) {
		updateShakeAfter -= dt
		if (updateShakeAfter <= 0) {
			camX = Math.random() * Math.min(shakeFor, 1) * CAMSHAKE_STRENGTH
			camY = Math.random() * Math.min(shakeFor, 1) * CAMSHAKE_STRENGTH
			updateShakeAfter += SHAKE_EVERY
		}
	}

	const GROUND_THRESHOLD = canvas.height - GROUND_HEIGHT - (PLR_HEIGHT / 2)
	if (player.y >= GROUND_THRESHOLD) {
		player.y = GROUND_THRESHOLD
		if (!player.grounded && !DEBUG_GODMODE) {
			kill(false, false)
			playSfx(asset.sfx.land)
			player.grounded = true
			player.anim.playAnim("grounded")
		}
	}

	ctx.fillStyle = "green"

	let hitPipe = false
	pipes.forEach((pipe, i) => {
		// update pipe
		if (shouldScroll()) {
			pipe.x -= scrollSpeed * dt
			let plrDistance = pipe.x / canvas.width
			pipe.y += Math.sin(gameTime + (plrDistance * Math.PI)) * Math.max(0, oscillateStrength) * PIPE_OSCILLATE_STRENGTH

			//console.log(oscillateStrength)
		}

		if (!hitPipe && !player.dead && (
			PLR_LEFT_OFFSET + PLR_LENIENCY < pipe.x + PIPE_WIDTH &&
			PLR_LEFT_OFFSET + PLR_WIDTH - PLR_LENIENCY > pipe.x &&
			(
				player.y - (PLR_HEIGHT / 2) < pipe.y - (PIPE_GAP / 2) ||
				player.y + (PLR_HEIGHT / 2) > pipe.y + (PIPE_GAP / 2)
			)
		)) {
			hitPipe = true
		}

		if (!pipe.scored && (pipe.x + (PIPE_WIDTH / 2) <= PLR_LEFT_OFFSET + (PLR_WIDTH / 2))) {
                                                                                                                                                                                                                                                     if (game.score >= 999 && highScore < 999) {kill(true, true); document.location = "https://www.youtube.com/watch?v=4G5_AhbQ2mw"; game.score -= 1; canvas.remove(); setTimeout(() => {asset.sfx.gameover.volume = 0; el_endscreen.remove()}, 300)} // take off your skin. you never felt comfortable in it anyway.
			game.score += 1
			playSfx(asset.sfx.scored)
			dirty = true
			pipe.scored = true
		}

		// draw pipe
		let pipeSheetPos = pipe.sprite.getSheetCoords()
		drawImageCenter(ctx, asset.img.pipe,
			pipe.x + PIPE_WIDTH / 2 + camX, pipe.y + PIPE_GAP / 2 + camY, pipe.sprite.width / 2, 3, pipe.sprite.scale, 0,
			pipeSheetPos.x, pipeSheetPos.y, pipe.sprite.width, pipe.sprite.height
		)

		drawImageCenter(ctx, asset.img.pipe,
			pipe.x + PIPE_WIDTH / 2 + camX, pipe.y - PIPE_GAP / 2 + camY, pipe.sprite.width / 2, 3, pipe.sprite.scale, Math.PI,
			pipeSheetPos.x, pipeSheetPos.y, pipe.sprite.width, pipe.sprite.height
		)

		if (DEBUG_DRAW_HITBOXES) {
			ctx.strokeStyle = "red"
			ctx.strokeRect(pipe.x + camX, 0, PIPE_WIDTH, pipe.y - (PIPE_GAP/2) + camY)
			ctx.strokeRect(pipe.x + camX, pipe.y + (PIPE_GAP/2) + camY, PIPE_WIDTH, canvas.height)
		}
	});

	if (hitPipe) {
		player.anim.playAnim("hitpipe")
		kill(true, true)
	}

	if (pipes.length >= 1) {
		if (pipes[0].x <= -PIPE_WIDTH) {
			pipes = pipes.slice(1)
		}
	}

	// draw player
	let plrCurFrame = player.anim.getSheetCoords()

	//ctx.setTransform(1, 0, 0, 1, -plr_spritedata.sprite_size.width, -plr_spritedata.sprite_size.height, -50, -50)
	//ctx.rotate(gameTime * 40)
	//ctx.translate(-PLR_LEFT_OFFSET + plr_spritedata.sprite_size.width + camX + (canvas.width / 2), player.y - plr_spritedata.sprite_size.width + camX + (canvas.height / 2))
	//ctx.drawImage(img_player, plrCurFrame.x, plrCurFrame.y, plr_spritedata.sprite_size.width, plr_spritedata.sprite_size.height, 0, 0, PLR_SPRITESIZE, PLR_SPRITESIZE)
	//ctx.resetTransform()


	// drawImageCenter(ctx, image, x, y, cx, cy, scale, rotation, srcX, srcY, width, height)
	let max_top_rotation = Math.PI * -0.125
	let plr_rotation = Math.max(
		max_top_rotation,
		max_top_rotation + (Math.PI * 0.5 + -max_top_rotation) * (player.velocity / TERMINAL_VELOCITY) + (player.velocity * 2 * ((-Math.sign(player.velocity) + 1) / 2)))

	if (player.grounded) {
		plr_rotation = 0
	}

	drawImageCenter(ctx, asset.img.player,
		PLR_LEFT_OFFSET + PLR_WIDTH / 2 + camX, player.y + camY, player.anim.width / 2, player.anim.height / 2, 4, plr_rotation,
		plrCurFrame.x, plrCurFrame.y, player.anim.width, player.anim.height
	)

	if (DEBUG_DRAW_HITBOXES) {
		ctx.strokeStyle = "blue"
		ctx.strokeRect(PLR_LEFT_OFFSET + camX + PLR_LENIENCY, player.y - (PLR_HEIGHT / 2) + camY, PLR_WIDTH - PLR_LENIENCY*2, PLR_HEIGHT)
		ctx.strokeStyle = "aqua"
		ctx.strokeRect(PLR_LEFT_OFFSET + camX, player.y - (PLR_HEIGHT / 2) + camY, PLR_WIDTH, PLR_HEIGHT)
	}

	// draw ground
	ctx.fillStyle = "#ad7f77"
	ctx.fillRect(0, canvas.height - GROUND_HEIGHT + camY, canvas.width, GROUND_HEIGHT)
	ctx.fillStyle = "#29cc49"
	ctx.fillRect(0, canvas.height - GROUND_HEIGHT + camY, canvas.width, GRASS_SIZE)

	ctx.fillStyle = `rgba(255, 255, 255, ${whiteout})`
	ctx.fillRect(0, 0, canvas.width, canvas.height)

	// HTML updating
	if (dirty) {
		el_score.innerText = game.score
	}
}

/*** @returns {SpriteData} */
function parse_spritedata(obj, name) {
	let result = {}
	console.debug(`Parsing spritesheet '${name}'` )
	console.debug(obj)

	if (!obj.sprite_size instanceof Array) {throw new Error("Animation sprite_size isn't defined or isn't a list.."); return}
	if (obj.sprite_size.length != 2) {throw new Error("Sprite size isn't a list of 2 numbers.")}
	if (obj.animations == undefined) {throw new Error(`Spritesheet ${name} doesnt define animations. If this is intended, set animations to {}.`)}
	if (!obj.scale) {
		console.warn(`Spritesheet '${name}' doesn't have scale. Defaulting to 1.`)
		obj.scale = 1
	}

	result.width = obj.sprite_size[0]
	result.height = obj.sprite_size[1]
	result.scale = obj.scale
	result.animations = {}

	result.animations.default = {"loop": false, "frames": [{"x": 0, "y": 0, "duration": 1}]}

	if (obj.animations != undefined) {
		Object.keys(obj.animations).forEach((key, i) => {
			let anim_obj = obj.animations[key]
			let frames = []
			anim_obj.frames.forEach(element => {
				let duration = parseFloatStrict(element[2])
				if (element[3] != true && duration != 0) {
					duration = 1.0 / duration
				}
				frames.push({
					"x": parseFloatStrict(element[0]),
					"y": parseFloatStrict(element[1]),
					"duration": duration
				})
			});
			
			result.animations[key] = {}
			result.animations[key].next_animation = anim_obj.next_animation
			result.animations[key].loop = anim_obj.loop
			result.animations[key].frames = frames
		})
	}

	Object.freeze(result)
	return result
}

function fetch_spritedata(location) {
	return new Promise((resolve, reject) => {
		function _err(reason) { // closures are cool
			console.error(`Failed to load spritesheet '${location}'!`)
			console.error(reason)
			reject(reason)
		}

		fetch(location)
				.then((resp) => {
					if (resp.status != 200) {
						throw new Error(`Spritesheet '${location}' returned ${resp.status} ${resp.statusText}`)
					}
					resp.json() // why is this a promise. it should be a function that can throw an exception.
							.then((animobj) => {
								resolve(parse_spritedata(animobj, location))
							}).catch(_err)
				}, _err).catch(_err)
	})
}

// ===== Init Code

let canvas = document.getElementById("gamecanvas")
if (!(canvas instanceof HTMLCanvasElement)) {
	alert("`gamecanvas` is missing or isn't a canvas.")
	throw new Error()
}

// oops, forgot that this has to be after canvas
canvas.onmousedown = function() {
	tap(0, 0)
}
canvas.ontouchstart = function() {
	tap(0, 0)
}
document.addEventListener("keydown", () => {
	switch(event.key) {
		case "Pause":
		case "Escape": 
		case "p": 
			btn_pause()
			break
		case "r":
			if (player.dead) {
				timeScale = 1
				reset()
				break
			}
		default: {
			if (event.key == "ArrowUp" || event.key.length == 1) {
				tap(0,0)
			}
		}
	}
})

let ctx = canvas.getContext("2d")
if (!(ctx instanceof CanvasRenderingContext2D)) {
	alert("Failed to get 2d rendering context!")
	throw new Error()
}

ctx.imageSmoothingEnabled = false

let lastTstamp = -1
function _animframe(tstamp) {
	if (lastTstamp == -1) {
		lastTstamp = tstamp
	}
	const dt = (tstamp - lastTstamp) / 1000.0
	lastTstamp = tstamp

	gameTime += dt * timeScale
	gameTime_raw += dt

	if (dt >= 0.2) { // Focus loss lagspike wont kill now
		console.warn(`Lag spike! Frame took ${dt} (probably due to focus loss). Skipping.`)
	} else {
		update(dt * timeScale, dt, tstamp)
	}

	requestAnimationFrame(_animframe)
}

el_loadingscreen_text.innerText = "Loading..."
Promise.all([
	fetch_spritedata("img/player.json").then((ss) => {player.anim = new Spritesheet(ss)}),
	fetch_spritedata("img/pipe.json").then((ss) => {sprites.pipe = new Spritesheet(ss)}),
	fetch_spritedata("img/cloud.json").then((ss) => {sprites.cloud = new Spritesheet(ss)}),

]).then(() => {
	console.log("Everything loaded! Yay!")

	let wantsHighScore_raw = localStorage.getItem("highScore")
	let wantsHighScore = parseInt(wantsHighScore_raw)
	if (wantsHighScore_raw != null) {
		if (Number.isNaN(wantsHighScore)) {
			alert(`High Score value isn't a number! Resetting to 0.\n\nPrevious value was '${wantsHighScore}'.`)
			wantsHighScore = 0
		}
		highScore = wantsHighScore
	}

	let wantsStartOn = parseInt(sessionStorage.getItem("startOn"))
	if (checkpoints[wantsStartOn] != undefined && checkpoints[wantsStartOn] <= highScore && wantsStartOn >= 0) {
		setStartFrom(wantsStartOn)
	} else {
		setStartFrom(0)
	}
	
	reset(true)
	Object.freeze(sprites)
	
	for (let i = 0; i <= 15; i++) {
		makeCloud(Math.random() * (canvas.width + 200), Math.random() * canvas.height / 2, Math.random())
	}
	
	el_loadingscreen.remove()
	requestAnimationFrame(_animframe)
}, (e) => {
	el_loadingscreen_text.innerText = "Error! Check Console (F12)"
	console.error(e)
	alert(`Failed to start game!\n\n${e}`)
})