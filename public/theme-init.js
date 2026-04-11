(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t === "light") {
      document.documentElement.classList.add("light");
    } else if (t === "dark") {
      document.documentElement.classList.add("dark");
    } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
})();
