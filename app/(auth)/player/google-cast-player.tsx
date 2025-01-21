import React, { useMemo, useRef, useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { Button } from "@/components/Button";
import { Feather, Ionicons } from "@expo/vector-icons";
import { RoundButton } from "@/components/RoundButton";

import GoogleCast, { CastButton, CastContext, CastState, MediaInfo, MediaStatus, RemoteMediaClient, useCastDevice, useCastState, useDevices, useMediaStatus, useRemoteMediaClient, useStreamPosition } from "react-native-google-cast";
import { useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Slider } from "react-native-awesome-slider";
import { runOnJS, useAnimatedReaction, useSharedValue } from "react-native-reanimated";
import { debounce } from "lodash";
import { useSettings } from "@/utils/atoms/settings";
import { useHaptic } from "@/hooks/useHaptic";
import { writeToLog } from "@/utils/log";
import { formatTimeString } from "@/utils/time";
import { BlurView } from "expo-blur";

export default function Player() {

    const castState = useCastState()

    const client = useRemoteMediaClient();
    const castDevice = useCastDevice();
    const devices = useDevices();
    const sessionManager = GoogleCast.getSessionManager();
    const discoveryManager = GoogleCast.getDiscoveryManager();
    const mediaStatus = useMediaStatus();

    const router = useRouter()

    const lightHapticFeedback = useHaptic("light");

    useEffect(() => {
        (async () => {
            if (!discoveryManager) {
                console.warn("DiscoveryManager is not initialized");
                return;
            }

            await discoveryManager.startDiscovery();
        })();
    }, [client, devices, castDevice, sessionManager, discoveryManager]);

    // Android requires the cast button to be present for startDiscovery to work
    const AndroidCastButton = useCallback(
        () =>
            Platform.OS === "android" ? (
                <CastButton tintColor="transparent" />
            ) : (
                <></>
            ),
        [Platform.OS]
    );

    const GoHomeButton = () => (
        <Button
            onPress={() => {
                router.push('/(auth)/(home)/')
            }}
        >
            Go Home
        </Button>
    )

    if (castState === CastState.NO_DEVICES_AVAILABLE || castState === CastState.NOT_CONNECTED) {
        // no devices to connect to
        if (devices.length === 0) {
            return (
                <View className="w-screen h-screen flex flex-col " >
                    <AndroidCastButton />
                    <View className="w-screen h-screen flex flex-col items-center justify-center bg-black">
                        <Text className="text-white text-lg">No Google Cast devices available.</Text>
                        <Text className="text-gray-400" >Are you on the same network?</Text>
                    </View>
                    <View className="px-10">
                        <GoHomeButton />
                    </View>
                </View>
            )
        }
        // no device selected
        return (
            <View className="w-screen h-screen flex flex-col " >
                <AndroidCastButton />
                <View className="w-screen h-screen flex flex-col items-center justify-center bg-black">
                    <RoundButton
                        size="large"
                        background={false}
                        onPress={() => {
                            lightHapticFeedback();
                            CastContext.showCastDialog();
                        }}
                    >
                        <AndroidCastButton />
                        <Feather name="cast" size={42} color={"white"} />
                    </RoundButton>
                    <Text className="text-white text-xl mt-2">No device selected</Text>
                    <Text className="text-gray-400" >Click icon to connect.</Text>
                </View>
                <View className="px-10">
                    <GoHomeButton />
                </View>
            </View>
        )
    }

    if (castState === CastState.CONNECTING) {
        return (
            <View className="w-screen h-screen flex flex-col items-center justify-center bg-black">
                <Text className="text-white font-semibold lg mb-2">Establishing connection...</Text>
                <Loader />
            </View>
        )
    }

    // connected, but no media playing
    if (!mediaStatus) {
        return (
            <View className="w-screen h-screen flex flex-col " >
                <View className="w-screen h-screen flex flex-col items-center justify-center bg-black">
                    <Text className="text-white text-lg">No media selected.</Text>
                    <Text className="text-gray-400" >Start playing any media</Text>
                </View>
                <View className="px-10">
                    <GoHomeButton />
                </View>
            </View>
        )
    }

    return (
        <ChromecastControls
            mediaStatus={mediaStatus}
            client={client}
        />
    )
}

function ChromecastControls({ mediaStatus, client }: { mediaStatus: MediaStatus, client: RemoteMediaClient | null }) {
    const lightHapticFeedback = useHaptic("light");

    const streamPosition = useStreamPosition()

    const [settings] = useSettings();

    const [isSliding, setIsSliding] = useState(false)

    const [currentTime, setCurrentTime] = useState(0);
    const [remainingTime, setRemainingTime] = useState(Infinity);

    const min = useSharedValue(0);
    const max = useSharedValue(mediaStatus.mediaInfo?.streamDuration || 0);
    const progress = useSharedValue(streamPosition || 0)
    const isSeeking = useSharedValue(false);

    const wasPlayingRef = useRef(false);
    const lastProgressRef = useRef<number>(0);

    const isPlaying = mediaStatus.playerState === 'playing'
    const isBufferingOrLoading = mediaStatus.playerState === 'buffering' || mediaStatus.playerState === 'loading'

    // request update of media status every player state change
    useEffect(() => {
        client?.requestStatus()
    }, [mediaStatus.playerState])

    // update progess on stream position change
    useEffect(() => {
        if(streamPosition) progress.value = streamPosition
    }, [streamPosition])

    // update max progress
    useEffect(() => {
        if(mediaStatus.mediaInfo?.streamDuration) max.value = mediaStatus.mediaInfo?.streamDuration
    }, [mediaStatus.mediaInfo?.streamDuration])

    const updateTimes = useCallback((currentProgress: number, maxValue: number) => {
        setCurrentTime(progress.value);
        setRemainingTime(max.value - progress.value);
    }, []);

    useAnimatedReaction(
        () => ({
            progress: progress.value,
            max: max.value,
            isSeeking: isSeeking.value,
        }),
        (result) => {
            if (result.isSeeking === false) {
                runOnJS(updateTimes)(result.progress, result.max);
            }
        },
        [updateTimes]
    );

    function pause() {
        client?.pause()
    }

    function play() {
        client?.play()
    }

    function seek(time: number) {
        client?.seek({
            position: time
        })
    }

    function togglePlay() {
        if (isPlaying) pause()
        else play()
    }

    const handleSliderStart = useCallback(() => {
        setIsSliding(true);
        wasPlayingRef.current = isPlaying;
        lastProgressRef.current = progress.value;

        pause();
        isSeeking.value = true;
    }, [isPlaying]);

    const handleSliderComplete = useCallback(
        async (value: number) => {
            isSeeking.value = false;
            progress.value = value;
            setIsSliding(false);

            seek(Math.max(0, Math.floor(value)));
            if (wasPlayingRef.current === true) play();
        },
        []
    );

    const [time, setTime] = useState({ hours: 0, minutes: 0, seconds: 0 });
    const handleSliderChange = useCallback(
        debounce((value: number) => {

            // TODO check if something must be done here

            const progressInSeconds = Math.floor(value);
            const hours = Math.floor(progressInSeconds / 3600);
            const minutes = Math.floor((progressInSeconds % 3600) / 60);
            const seconds = progressInSeconds % 60;
            setTime({ hours, minutes, seconds });
        }, 3),
        []
    );

    const handleSkipBackward = useCallback(async () => {
        if (!settings?.rewindSkipTime) return;
        wasPlayingRef.current = isPlaying;
        lightHapticFeedback();
        try {
            const curr = progress.value;
            if (curr !== undefined) {
                const newTime = Math.max(0, curr - settings.rewindSkipTime)
                seek(newTime);
                if (wasPlayingRef.current === true) play();
            }
        } catch (error) {
            writeToLog("ERROR", "Error seeking video backwards", error);
        }
    }, [settings, isPlaying]);

    const handleSkipForward = useCallback(async () => {
        if (!settings?.forwardSkipTime) return;
        wasPlayingRef.current = isPlaying;
        lightHapticFeedback();
        try {
            const curr = progress.value;
            if (curr !== undefined) {
                const newTime = curr + settings.forwardSkipTime
                seek(Math.max(0, newTime));
                if (wasPlayingRef.current === true) play();
            }
        } catch (error) {
            writeToLog("ERROR", "Error seeking video forwards", error);
        }
    }, [settings, isPlaying]);

    const mediaMetadata = mediaStatus.mediaInfo?.metadata;

    const type = mediaMetadata?.type || 'generic'
    const images = mediaMetadata?.images || []

    const blurhash = '|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7azayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[';

    const ItemInfo = useMemo(() => {
        switch(type) {
            case 'generic': return <GenericInfo mediaMetadata={mediaMetadata} />
            case 'movie': return <MovieInfo mediaMetadata={mediaMetadata} />
            case 'tvShow': return <TvShowInfo mediaMetadata={mediaMetadata} />
            default: return <Text>{type} not implemented yet!</Text>
        }
    }, [type])

    // Android requires the cast button to be present for startDiscovery to work
    const AndroidCastButton = useCallback(
        () =>
            Platform.OS === "android" ? (
            <CastButton tintColor="transparent" />
            ) : (
            <></>
            ),
        [Platform.OS]
    );

    return (
        <View className="w-full h-full flex flex-col items-center justify-center bg-black" >
            <View className="w-full h-full flex flex-col justify-between bg-black" >
                <BlurView
                    intensity={60}
                    tint='dark'
                    experimentalBlurMethod='dimezisBlurView'
                >
                    <View className="flex flex-row items-baseline justify-between w-full" >
                        <View
                            className="mt-8 py-2 px-4 w-fit"
                        >
                            {ItemInfo}
                        </View>
                        <RoundButton
                            size="large"
                            className="mr-4 mb-4"
                            background={false}
                            onPress={() => {
                                CastContext.showCastDialog();
                            }}
                        >
                            <AndroidCastButton />
                            <Feather name="cast" size={30} color={"white"} />
                        </RoundButton>
                    </View>
                </BlurView>
                <Image
                    className="flex h-full w-full bg-[#0553] absolute -z-50"
                    source={images[0].url}
                    placeholder={{ blurhash }}
                    contentFit="cover"
                    transition={1000}
                />
                <BlurView
                    intensity={20}
                    tint='dark'
                    // blurs buttons too. not wanted
                    experimentalBlurMethod='dimezisBlurView'
                    className="pt-1"
                >
                    <View className={`flex flex-col w-full shrink px-2`}>
                        <Slider
                            theme={{
                                maximumTrackTintColor: "rgba(255,255,255,0.2)",
                                minimumTrackTintColor: "#fff",
                                cacheTrackTintColor: "rgba(255,255,255,0.3)",
                                bubbleBackgroundColor: "#fff",
                                bubbleTextColor: "#666",
                                heartbeatColor: "#999",
                            }}
                            renderThumb={() => null}
                            onSlidingStart={handleSliderStart}
                            onSlidingComplete={handleSliderComplete}
                            onValueChange={handleSliderChange}
                            containerStyle={{
                                borderRadius: 100,
                            }}
                            renderBubble={() => isSliding}
                            sliderHeight={10}
                            thumbWidth={0}
                            progress={progress}
                            minimumValue={min}
                            maximumValue={max}
                        />
                        <View className="flex flex-row items-center justify-between mt-2">
                            <Text className="text-[12px] text-neutral-400">
                                {formatTimeString(currentTime, "s")}
                            </Text>
                            <Text className="text-[12px] text-neutral-400">
                                -{formatTimeString(remainingTime, "s")}
                            </Text>
                        </View>
                        <View className="flex flex-row w-full items-center justify-evenly mt-2 mb-10">
                            <TouchableOpacity onPress={() => { }} >
                                <Ionicons
                                    name="play-skip-back-outline"
                                    size={30}
                                    color="white"
                                />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleSkipBackward} >
                                <Ionicons
                                    name="play-back-outline"
                                    size={30}
                                    color="white"
                                />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => togglePlay()}
                                className="flex w-14 h-14 items-center justify-center"
                            >
                                {!isBufferingOrLoading ? (
                                    <Ionicons
                                        name={isPlaying ? "pause" : "play"}
                                        size={50}
                                        color="white"
                                    />
                                ) : (
                                    <Loader size={"large"} />
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleSkipForward} >
                                <Ionicons
                                    name="play-forward-outline"
                                    size={30}
                                    color="white"
                                />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => { }} >
                                <Ionicons
                                    name="play-skip-forward-outline"
                                    size={30}
                                    color="white"
                                />
                            </TouchableOpacity>
                        </View>
                    </View>
                </BlurView>
            </View>
        </View>
    )
}

type MetadataInfoProps = { mediaMetadata: MediaInfo['metadata'] }

function GenericInfo({ mediaMetadata }: MetadataInfoProps) {

    const title = mediaMetadata?.title || 'Title not found!'

    return (
        <>
            <Text className="text-white font-bold text-3xl">{title}</Text>
            {
                // @ts-expect-error The metadata type doesn't have subtitle, but the object has
                mediaMetadata?.subtitle && <Text>{mediaMetadata?.subtitle}</Text>
            }
        </>
    )
}

function MovieInfo({ mediaMetadata }: MetadataInfoProps) {

    const title = mediaMetadata?.title || 'Title not found!'

    return (
        <>
            <Text className="text-white font-bold text-3xl">{title}</Text>
            {
                // @ts-expect-error The metadata type doesn't have subtitle, but the object has
                mediaMetadata?.subtitle && <Text>{mediaMetadata?.subtitle}</Text>
            }
        </>
    )
}

function TvShowInfo({ mediaMetadata }: MetadataInfoProps) {

    const itemTitle: string = mediaMetadata?.title || 'Title not found!'
    // @ts-expect-error
    const seriesTitle: string = mediaMetadata?.seriesTitle || 'Title not found!'

    // @ts-expect-error
    const episodeNumber: number = mediaMetadata?.episodeNumber || 0
    // @ts-expect-error
    const seasonNumber: number = mediaMetadata?.seasonNumber || 0

    return (
        <>
            <View className="flex w-full" >
                <Text className="text-gray-300 font-bold text-2xl">{seriesTitle}</Text>
                <Text className="text-white font-bold text-3xl">{itemTitle}</Text>
            </View>
            <Text>
                Season {seasonNumber.toLocaleString()} {' '}
                Episode {episodeNumber.toLocaleString()}
            </Text>
        </>
    )
}