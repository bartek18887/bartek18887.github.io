const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a", "Enter"]

var step = 0

function onKonami() {
    console.log("Konami code pressed.")

    // Defined in script.js
    DEBUG_SHOW_NEGATIVE_CHECKPOINTS = true
    refreshStartFroms()
}

document.addEventListener("keydown", (e) => {    
    if (e.key == KONAMI[step]) {
        step++
        if (step == KONAMI.length) {onKonami()}
    } else {
        step = 0
    }
})
