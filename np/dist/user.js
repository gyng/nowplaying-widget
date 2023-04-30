// @ts-check

/** @type {(props: { artist: string, title: string, imageUrl: string }) => void} */
function updateUI(props) {
  const { artist, title, imageUrl } = props;
  document.getElementById("thumbnail").src = imageUrl;
  document.getElementById("np-1").innerText = title;
  document.getElementById("np-2").innerText = artist;
}

function handleSessionEvent(
  /** @type {{  Media: [{ media: { album: unknown; artist: string; genres: string[]; playback_type: string; subtitle: string; title: string; track_number: number}; playback: unknown; source: string; timeline: unknown}, {content_type: string, data: number[]}] }} */
  ev
) {
  if (!ev.Media) {
    console.error("Bad event in handleSessionEvent:", ev);
    return;
  }

  const [info, thumbnail] = ev.Media;
  const { artist, title } = info.media;

  const imageUrl = URL.createObjectURL(
    new Blob([new Uint8Array(thumbnail.data)], {
      type: thumbnail.content_type,
    })
  );

  updateUI({ artist, title, imageUrl });
}

window.__TAURI__.event.listen(
  "media_update",
  (
    /** @type {{ event: "media_update", id: number, payload: unknown }} */
    ev
  ) => {
    console.log("ev", ev);
    // @ts-expect-error
    handleSessionEvent(ev.payload);
  }
);

window.__TAURI__.tauri.invoke("get_last_update", { message: "" }).then((ev) => {
  console.log("get_last_update ev", ev);
  handleSessionEvent(ev);
});

let decorations = false;
const decorationToggle = document.createElement("button");
decorationToggle.innerText = "Toggle decorations";
decorationToggle.addEventListener("click", () => {
  decorations = !decorations;
  window.__TAURI__.window.getCurrent().setDecorations(decorations);
});
document.getElementById("debug")?.appendChild(decorationToggle);

document.getElementById("thumbnail")?.addEventListener("dragstart", (e) => {
  e.preventDefault();
  window.__TAURI__.window.getCurrent().startDragging();
});
