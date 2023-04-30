use std::{
    io::BufReader,
    time::{Duration, SystemTime},
};

use serde::{Deserialize, Serialize};
use windows::{
    core::Result,
    Foundation::{EventRegistrationToken, TypedEventHandler},
    Media::Control::{
        GlobalSystemMediaTransportControlsSession,
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionMediaProperties,
        GlobalSystemMediaTransportControlsSessionTimelineProperties,
    },
    Media::MediaPlaybackType,
    Storage::Streams::{DataReader, IRandomAccessStreamWithContentType},
};

pub fn read_stream_sync(stream: IRandomAccessStreamWithContentType) -> Result<Vec<u8>> {
    let stream_len = stream.Size()? as usize;
    let mut data = vec![0u8; stream_len];
    let reader = DataReader::CreateDataReader(&stream)?;
    reader.LoadAsync(stream_len as u32)?.get()?;
    reader.ReadBytes(&mut data)?;

    reader.Close().ok();
    stream.Close().ok();

    Ok(data)
}

#[derive(Debug, Clone, Serialize)]
pub struct MediaProperties {
    pub title: String,
    pub subtitle: String,
    pub artist: String,
    pub album_artist: String,
    pub track_number: i32,
    pub album_track_count: i32,
    pub album_title: String,

    // pub genres: Vec<String>,

    // pub playback_type: PlaybackType,
    pub thumbnail: ThumbnailStream,
}

#[derive(Debug, Clone, Serialize)]
pub struct TimelineProperties {
    pub end_time: Duration,
    pub last_updated_time: i64,
    pub max_seek_time: Duration,
    pub min_seek_time: Duration,
    pub position: Duration,
    pub start_time: Duration,
}

impl TryFrom<GlobalSystemMediaTransportControlsSessionTimelineProperties> for TimelineProperties {
    type Error = windows::core::Error;

    fn try_from(
        value: GlobalSystemMediaTransportControlsSessionTimelineProperties,
    ) -> std::result::Result<Self, Self::Error> {
        Ok(TimelineProperties {
            end_time: value.EndTime()?.into(),
            last_updated_time: value.LastUpdatedTime()?.UniversalTime,
            max_seek_time: value.MaxSeekTime()?.into(),
            min_seek_time: value.MinSeekTime()?.into(),
            position: value.Position()?.into(),
            start_time: value.StartTime()?.into(),
        })
    }
}

#[derive(Debug, Clone, Eq, PartialEq, Serialize, Deserialize)]
pub enum PlaybackType {
    Unknown = 0,
    Music = 1,
    Video = 2,
    Image = 3,
}

// impl From<MediaPlaybackType> for PlaybackType {
//     fn from(value: MediaPlaybackType) -> Self {
//         PlaybackType(value)
//     }
// }

#[derive(Debug, Clone, Serialize)]
pub struct ThumbnailStream {
    pub content_type: String,
    pub id: String,
    #[serde(skip_serializing)]
    pub stream: IRandomAccessStreamWithContentType,
}

impl TryFrom<GlobalSystemMediaTransportControlsSessionMediaProperties> for MediaProperties {
    type Error = windows::core::Error;

    fn try_from(
        value: GlobalSystemMediaTransportControlsSessionMediaProperties,
    ) -> std::result::Result<Self, Self::Error> {
        // todo: move out of this as it's expensive
        let thumb = value.Thumbnail()?.OpenReadAsync()?.get()?;
        let content_type = thumb.ContentType()?.to_string();

        Ok(MediaProperties {
            title: value.Title()?.to_string(),
            subtitle: value.Subtitle()?.to_string(),
            artist: value.Artist()?.to_string(),
            album_artist: value.AlbumArtist()?.to_string(),
            track_number: value.TrackNumber()?,
            album_track_count: value.AlbumTrackCount()?,
            album_title: value.AlbumTitle()?.to_string(),
            // genres: value.Genres()?.to_owned().into(),
            // playback_type: value.PlaybackType()?.Value()?.into(),
            thumbnail: ThumbnailStream {
                content_type,
                id: format!("{:#?}", thumb),
                stream: thumb,
            },
        })
    }
}

pub async fn get_now_playing() -> Result<MediaProperties> {
    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.await?;
    let session = manager.GetCurrentSession()?;

    // let info = session.GetPlaybackInfo()?;
    // session.

    let media = session.TryGetMediaPropertiesAsync()?.await?;
    let media: MediaProperties = media.try_into()?;

    let timeline = session.GetTimelineProperties()?;
    let timeline: TimelineProperties = timeline.try_into()?;

    // dbg!(&timeline);

    // let s = serde_json::to_string(&media);
    // dbg!(s);

    Ok(media)
}
