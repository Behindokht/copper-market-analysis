/* The page background. Public builds draw a dark texture in CSS (--bg-texture in site.css) and never ask for a photo.
   On the owner's own disk (the page opened from a file) the patina photo in assets/ replaces the texture if the file is there. Its licence is not confirmed (known issue K08), so assets/ is not in the repository.
   When the photo is not used, body gets the class no-photo and the smoked plates get a denser tint. */
(function () {
  var root = document.documentElement, body = document.body;
  var cur = getComputedStyle(root).getPropertyValue("--bg-photo") || "";
  if (/url\(\s*["']?data:image\/(webp|jpeg|png)/.test(cur)) { return; }          // a private preview with the photo embedded
  if (location.protocol !== "file:") { body.classList.add("no-photo"); return; }
  var probe = new Image();
  probe.onload = function () { root.style.setProperty("--bg-photo", 'url("../../assets/patina-background.webp")'); };
  probe.onerror = function () { body.classList.add("no-photo"); };
  probe.src = "../assets/patina-background.webp";
})();
