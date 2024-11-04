import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { addPeer, createPeer } from "../../utils/peer.js";
import { baseURL } from "../../utils/constant.js";
import { useParams } from "react-router-dom";
import Video from "./components/Video.jsx";
import "../../styles/room.css";
import VideoGrid from "./VideoGrid.jsx";
import SideBar from "./SideBar.jsx";
import Footer from "./Footer.jsx";
import Header from "./Header.jsx";

export default function Room() {
    const { id } = useParams();
    const remotePeer = useRef({});
    const [videos, setVideos] = useState([]);

    const socketRef = useRef(io(baseURL, {
        withCredentials: true,
        query: { id },
    }));

    useEffect(() => {
        const socket = socketRef.current;
        let localStream;

        const initializeMediaStream = async () => {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: { aspectRatio: { exact: 16 / 9 } },
                    audio: {
                        sampleRate: 10,
                        sampleSize: 16,
                        channelCount: 2,
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    }
                });

                // Add local stream to remotePeer and set as muted for self-view
                remotePeer.current[0] = { peer: 0, video: <Video stream={localStream} userID={0} key={0} muted={true} /> };
                updateVideos();

                // Listen for connected users
                socket.on('connected-users', (users) => {
                    users?.forEach((userID) => {
                        const newRemotePeer = createPeer(socket, localStream, userID);
                        remotePeer.current[userID] = { peer: newRemotePeer };

                        newRemotePeer.on('stream', (stream) => {
                            console.log("Streaming sent signal", stream.getTracks());
                            remotePeer.current[userID] = { peer: newRemotePeer, video: <Video stream={stream} userID={userID} key={stream.id} /> };
                            updateVideos();
                        });
                    });
                });

                // Handle incoming RTC signals
                socket.on('rtc-signal', (signal, callerID) => {
                    const newRemotePeer = addPeer(socket, localStream, callerID);
                    newRemotePeer.signal(signal);
                    remotePeer.current[callerID] = { peer: newRemotePeer };

                    newRemotePeer.on('stream', (stream) => {
                        console.log("Streaming received signal", stream.getTracks());
                        remotePeer.current[callerID] = { peer: newRemotePeer, video: <Video stream={stream} userID={callerID} key={stream.id} /> };
                        updateVideos();
                    });
                });
            } catch (err) {
                console.error("Failed to get user media:", err);
            }
        };

        // Function to update video elements
        const updateVideos = () => {
            setVideos(Object.values(remotePeer.current)
                .filter(peer => peer.video)
                .map(peer => peer.video)
            );
        };

        initializeMediaStream();

        // Listen for returning RTC signal to complete handshake
        socket.on('return-rtc-signal', (signal, peerID) => {
            if (remotePeer.current[peerID]) {
                remotePeer.current[peerID].peer.signal(signal);
            }
        });

        // Handle user disconnection
        socket.on("user-disconnected", (peerID) => {
            if (remotePeer.current[peerID]) {
                remotePeer.current[peerID].peer.removeAllListeners();
                delete remotePeer.current[peerID];
                updateVideos();
            }
        });

        return () => {
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }

            Object.values(remotePeer.current).forEach(rPeer => rPeer.peer.removeAllListeners());
            remotePeer.current = {};

            socket.emit("end-call");
            socket.removeAllListeners();
        };
    }, []);

    return (
        <div className="h-screen w-screen flex">
            <div className="flex flex-col w-full lg:w-4/5 h-full">
                <Header className="flex border-b-2 border-slate-200 border-opacity-20 flex-grow shadow-lg shadow-slate-900" />
                <VideoGrid videos={videos} style={{ height: "80%" }} />
                <Footer socket={socketRef.current} className="flex-grow" />
            </div>
            <SideBar className="hidden flex-col lg:flex w-1/5" />
        </div>
    );
}
