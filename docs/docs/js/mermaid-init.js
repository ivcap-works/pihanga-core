document.addEventListener("DOMContentLoaded", function () {
  mermaid.initialize({startOnLoad: false, theme: "default"});
  document.querySelectorAll("code.language-mermaid").forEach(function (el) {
    const div = document.createElement("div");
    div.className = "mermaid";
    div.textContent = el.textContent;
    el.parentElement.replaceWith(div);
  });
  mermaid.run({querySelector: ".mermaid"});
});
