import { ChangeEvent, FC, FormEvent, useEffect, useRef } from 'react';
import { useScriptideContext } from '../../contexts/ScriptideProvider';
import './MeetingForm.css';

import {
  FormField,
  Input,
  PrimaryButton,
  useMeetingManager,
  useLocalVideo,
  getDeviceId,
} from 'amazon-chime-sdk-component-library-react';
import { MeetingSessionConfiguration } from 'amazon-chime-sdk-js';
import {
  addAttendeeToDB,
  addMeetingToDB,
  createMeeting,
  getAttendeeFromDB,
  getMeetingFromDB,
  joinMeeting,
} from '../../utils/api';

const MeetingForm: FC = () => {
  const meetingManager = useMeetingManager();
  const { isVideoEnabled, toggleVideo } = useLocalVideo();

  const {
    setInitiator,
    setMeetingActive,
    setMeetingIdentifier,
    attendeeName,
    setName,
    meetingTitle,
    setMeetingTitle,
  } = useScriptideContext();

  // START: Code for Notion automatic re-login after granting access
  useEffect(() => {
    const params = new URL(location.href).searchParams;
    const code = params.get('code');
    if (!code) {
      return;
    } else {
      const localMeetingTitle = window.localStorage.getItem('meetingTitle');
      const localAttendeeName = window.localStorage.getItem('attendeeName');
      const meetingIsEnded = window.localStorage.getItem('meetingIsEnded');
      if (meetingIsEnded) {
        return;
      }
      if (
        typeof localMeetingTitle === 'string' &&
        typeof localAttendeeName === 'string'
      ) {
        const processedLocalStorageMeetingTitle = JSON.parse(localMeetingTitle);
        const processedLocalStorageAttendeeName = JSON.parse(localAttendeeName);

        setName(processedLocalStorageAttendeeName);
        setMeetingTitle(processedLocalStorageMeetingTitle);
        setTimeout(() => {
          // @ts-ignore
          document.getElementById('primary-button').click();
        }, 200);
      }
    }
  }, []);
  // END: Code for Notion automatic re-login after granting access

  function getAttendeeCallback() {
    return async (chimeAttendeeId: string, externalUserId?: string) => {
      const attendeeInfo: any = await getAttendeeFromDB(chimeAttendeeId);
      const attendeeData = attendeeInfo.data.getAttendee;
      return {
        name: attendeeData.name,
      };
    };
  }

  //Placeholder - we'll replace this function implementation later
  const clickedJoinMeeting = async (event: FormEvent) => {
    event.preventDefault();

    meetingManager.getAttendee = getAttendeeCallback();
    const title = meetingTitle.trim().toLocaleLowerCase();
    const name = attendeeName.trim();
    setMeetingIdentifier(title);

    const meetingResponse: any = await getMeetingFromDB(title);
    const meetingJson = meetingResponse.data.getMeeting;
    try {
      if (meetingJson) {
        setMeetingActive(true);
        const meetingData = JSON.parse(meetingJson.data);
        const joinInfo = await joinMeeting(meetingData.MeetingId, name);

        await addAttendeeToDB(joinInfo.Attendee.AttendeeId, name);
        const meetingSessionConfiguration = new MeetingSessionConfiguration(
          meetingData,
          joinInfo.Attendee
        );
        await meetingManager.join(meetingSessionConfiguration);
        await meetingManager.audioVideo?.realtimeMuteLocalAudio();
        // await meetingManager.audioVideo?.realtimeSetCanUnmuteLocalAudio(false);
        // await meetingManager.audioVideo?.startVideoInput();
      } else {
        setMeetingActive(true);
        const joinInfo = await createMeeting(title, name, 'us-east-1');
        await addMeetingToDB(
          title,
          joinInfo.Meeting.MeetingId,
          JSON.stringify(joinInfo.Meeting)
        );
        await addAttendeeToDB(joinInfo.Attendee.AttendeeId, name);
        setInitiator(joinInfo.Attendee.AttendeeId); //sets the first person in meeting as "initiator"
        const meetingSessionConfiguration = new MeetingSessionConfiguration(
          joinInfo.Meeting,
          joinInfo.Attendee
        );
        await meetingManager.join(meetingSessionConfiguration);
      }
    } catch (error) {
      console.log(error);
    }

    // At this point you can let users setup their devices, or start the session immediately
    await meetingManager.start();

    const videoDevice =
      await meetingManager.audioVideo?.listVideoInputDevices();

    let localVideoDevice;
    const videoStuff = videoDevice.map((info) => {
      const { deviceId } = info;
      localVideoDevice = deviceId;
    });

    await meetingManager.audioVideo?.startVideoInput(localVideoDevice);

    if (localVideoDevice && !isVideoEnabled) {
      setTimeout(() => {
        toggleVideo();
      }, 3000);
      toggleVideo();
    }
  };
  toggleVideo();

  return (
    <div className='form-container'>
      <form>
        <FormField
          field={Input}
          label='Meeting ID'
          value={meetingTitle}
          fieldProps={{
            name: 'Meeting ID',
            placeholder: 'Enter a Meeting ID',
          }}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setMeetingTitle(e.target.value);
            window.localStorage.setItem(
              'meetingTitle',
              JSON.stringify(e.target.value)
            );
          }}
        />
        <FormField
          field={Input}
          label='Name'
          value={attendeeName}
          fieldProps={{
            name: 'Name',
            placeholder: 'Enter your Attendee Name',
          }}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setName(e.target.value);
            window.localStorage.setItem(
              'attendeeName',
              JSON.stringify(e.target.value)
            );
          }}
        />
        <PrimaryButton
          label='Join Meeting'
          id='primary-button'
          onClick={clickedJoinMeeting}
        />
      </form>
    </div>
  );
};

export default MeetingForm;
