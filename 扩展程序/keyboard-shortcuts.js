(() => {
  const isEditing = (target) => target instanceof Element && Boolean(target.closest('textarea, input, select, [contenteditable]:not([contenteditable="false"])'));
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Backspace" || isEditing(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", code: "Delete", bubbles: true, cancelable: true }));
  }, true);
})();
