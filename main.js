// --- Three.js Setup ---
let scene, camera, renderer;

// --- Cannon.js Setup ---
let world;
let playerBody;
const playerMass = 70; // kg
const playerRadius = 0.5; // meters
const playerEyeHeight = 1.6; // meters, camera height offset from playerBody center

// --- Controls ---
let controlsEnabled = false;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;
let isOnGround = false;

const playerMoveSpeed = 5.0; // m/s
const playerJumpVelocity = 5.0; // m/s

const clock = new THREE.Clock();
const cannonStep = 1 / 60;

// Mouse look controls helper
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _PI_2 = Math.PI / 2;
const minPitchAngle = -_PI_2 + 0.01; // Min pitch (looking almost straight down)
const maxPitchAngle = _PI_2 - 0.01;  // Max pitch (looking almost straight up)

// Variables for interactive information display
let currentlyViewedArtwork = null;
let infoOverlay = null;
let lastInfoUpdateTime = 0;
const INFO_UPDATE_INTERVAL = 500; // milliseconds
let raycaster = null;
let mouse = new THREE.Vector2();
let artworkMeshes = [];

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Deep black background

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Camera position will be updated by playerBody
    
    // Initialize raycaster for detecting when user is looking at artwork
    raycaster = new THREE.Raycaster();
    
    // Get the info overlay DOM element
    infoOverlay = document.getElementById('infoOverlay');

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // --- Gallery Dimensions ---
    const hallSize = 20; // Overall size of the square hall (e.g., 20x20)
    let wallHeight = 3;  // Height of the walls - will be doubled
    wallHeight *= 2;
    const halfHallSize = hallSize / 2; // Thickness can be defined later when walls are actually created

    // Lighting
    // Ambient light provides a very subtle base illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.15); // Reduced significantly
    scene.add(ambientLight);

    // Directional light (simulating external light, now very minimal)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.05); // Further dimmed
    directionalLight.position.set(10, 15, 10);
    // directionalLight.castShadow = false; // External light probably shouldn't cast detailed shadows inside
    scene.add(directionalLight);

    // Gallery Interior Lights (SpotLights)
    const spotLightY = wallHeight - 0.5; // Position spotlights just below the NEW, TALLER ceiling
    const spotLightProperties = {
        color: 0xffeedd,       // Warm white
        intensity: 1.5,        // Adjusted intensity
        distance: hallSize * 0.8, // Effective distance
        angle: Math.PI / 6,    // Cone angle (approx 30 degrees) - Increased for wider spread
        penumbra: 0.6,         // Softness of the edge - Increased for softer edges
        decay: 2               // Physical falloff
    };

    const createSpotlight = (x, y, z, targetX, targetY, targetZ) => {
        const light = new THREE.SpotLight(
            spotLightProperties.color,
            spotLightProperties.intensity,
            spotLightProperties.distance,
            spotLightProperties.angle,
            spotLightProperties.penumbra,
            spotLightProperties.decay
        );
        light.position.set(x, y, z);
        light.target.position.set(targetX, targetY, targetZ);
        scene.add(light.target); // Target must be added to the scene
        light.castShadow = true;
        light.shadow.mapSize.width = 1024;
        light.shadow.mapSize.height = 1024;
        light.shadow.camera.near = 0.5;
        light.shadow.camera.far = spotLightProperties.distance;
        // light.shadow.focus = 1; // For sharper shadows, if needed
        scene.add(light);
        return light;
    };

    const wallTargetY = wallHeight / 2.5; // Target lights towards typical artwork height
    const spotLightOffsetFromWall = 2;
    const zPositions = [-hallSize / 3.5, 0, hallSize / 3.5]; // 3 lights per wall

    // Spotlights for +X wall (Wall at x = hallSize / 2)
    zPositions.forEach(zPos => {
        createSpotlight(
            hallSize / 2 - spotLightOffsetFromWall, spotLightY, zPos, // Light position
            hallSize / 2, wallTargetY, zPos                       // Target position on the wall
        );
    });

    // Spotlights for -X wall (Wall at x = -hallSize / 2)
    zPositions.forEach(zPos => {
        createSpotlight(
            -hallSize / 2 + spotLightOffsetFromWall, spotLightY, zPos, // Light position
            -hallSize / 2, wallTargetY, zPos                        // Target position on the wall
        );
    });

    // Spotlights for +Z wall (Wall at z = hallSize / 2)
    const xPositions = [-hallSize / 3.5, 0, hallSize / 3.5];
    xPositions.forEach(xPos => {
        createSpotlight(
            xPos, spotLightY, hallSize / 2 - spotLightOffsetFromWall, // Light position
            xPos, wallTargetY, hallSize / 2                        // Target position on the wall
        );
    });

    // Spotlights for -Z wall (Wall at z = -hallSize / 2)
    xPositions.forEach(xPos => {
        createSpotlight(
            xPos, spotLightY, -hallSize / 2 + spotLightOffsetFromWall, // Light position
            xPos, wallTargetY, -hallSize / 2                       // Target position on the wall
        );
    });

    // Central Ceiling Light for overall ambiance
    const centralLight = new THREE.PointLight(0xfff5e1, 0.25, hallSize * 1.2, 2); // Warmish white, weak, covers gallery, physical decay
    centralLight.position.set(0, wallHeight - 0.3, 0); // Just below NEW, TALLER ceiling center
    centralLight.castShadow = false; // No shadows for this ambient light
    scene.add(centralLight);

    // --- Cannon.js World Setup ---
    world = new CANNON.World();
    world.gravity.set(0, -9.82, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 10; // Improve solver accuracy

    // Ground
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0 });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(groundBody);

    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const textureLoader = new THREE.TextureLoader();
    const woodFloorTexture = textureLoader.load('https://cdn.polyhaven.com/asset_img/primary/wood_planks.png?height=720', function(texture) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set((hallSize / 4) * 10, (hallSize / 4) * 10); // Increase tiling by 10x
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); // Improve texture quality at glancing angles
        texture.needsUpdate = true;
    });
    const groundMaterial = new THREE.MeshStandardMaterial({
        map: woodFloorTexture,
        side: THREE.DoubleSide,
        roughness: 0.8, // Adjust for desired wood shininess
        metalness: 0.1  // Wood is not very metallic
    });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Gallery Bench (Legless and Scaled)
    const benchMaterial = new THREE.MeshStandardMaterial({ color: 0x5A5A5A, roughness: 0.7, metalness: 0.2 }); // Dark grey
    const benchScaleFactor = 3.0;
    let originalSeatHeight = 0.4; // Will be halved
    originalSeatHeight /= 2;
    const originalSeatWidth = 2.0;
    const originalSeatDepth = 0.5;

    const seatHeight = originalSeatHeight * benchScaleFactor;
    const seatWidth = originalSeatWidth * benchScaleFactor;
    const seatDepth = originalSeatDepth * benchScaleFactor;

    // Three.js Bench Mesh (just the seat)
    const benchGroup = new THREE.Group(); // Still use a group in case we want to rotate the whole bench later
    benchGroup.position.set(0, 0, 0); // Bench at gallery center, on the ground.
    scene.add(benchGroup);

    const seatGeo = new THREE.BoxGeometry(seatWidth, seatHeight, seatDepth);
    const seatMesh = new THREE.Mesh(seatGeo, benchMaterial);
    seatMesh.position.y = seatHeight / 2; // Seat rests directly on the ground
    seatMesh.castShadow = true;
    seatMesh.receiveShadow = true;
    benchGroup.add(seatMesh);

    // Cannon.js Bench Physics Body (just the seat)
    const benchBody = new CANNON.Body({ mass: 0 }); // Static body
    
    const seatShape = new CANNON.Box(new CANNON.Vec3(seatWidth / 2, seatHeight / 2, seatDepth / 2));
    // The position of the seat shape is relative to the benchBody's origin (which is at 0,0,0 on the ground)
    // Since the benchBody itself is at y=0, and the seatMesh is also positioned with its bottom at y=0 relative to the group,
    // the shape's offset y should also be seatHeight / 2.
    benchBody.addShape(seatShape, new CANNON.Vec3(0, seatHeight / 2, 0));

    benchBody.position.set(0, 0, 0); // Matches benchGroup's initial position (on the ground at gallery center)
    world.addBody(benchBody);

    // Ceiling
    const ceilingSize = hallSize; // Ceiling covers the whole hall
    const ceilingYPos = wallHeight;

    // Three.js Ceiling Mesh
    const ceilingGeometry = new THREE.PlaneGeometry(ceilingSize, ceilingSize);
    const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x050505, side: THREE.DoubleSide }); // Very dark grey
    const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceilingMesh.position.set(0, ceilingYPos, 0);
    ceilingMesh.rotation.x = Math.PI / 2; // Rotate to be horizontal, facing downwards by default from this rotation
    ceilingMesh.receiveShadow = true; // Optional, if lights are added above pointing down
    scene.add(ceilingMesh);

    // Cannon.js Ceiling Physics Body
    const ceilingShape = new CANNON.Plane();
    const ceilingBody = new CANNON.Body({ mass: 0 }); // Static body
    ceilingBody.addShape(ceilingShape);
    ceilingBody.position.set(0, ceilingYPos, 0);
    // Rotate the Cannon.js plane so its normal points downwards (-Y direction)
    ceilingBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
    world.addBody(ceilingBody);

    // Ceiling stars removed as per request.

    // Player Physics Body
    const playerShape = new CANNON.Sphere(playerRadius);
    playerBody = new CANNON.Body({
        mass: playerMass,
        shape: playerShape,
        position: new CANNON.Vec3(0, playerRadius + 0.1, 5), // Start slightly above ground
        linearDamping: 0.9, // To prevent sliding forever
        angularDamping: 1.0 // To prevent spinning from collisions
    });
    playerBody.addEventListener("collide", onPlayerCollision);
    world.addBody(playerBody);

    // Example Box has been removed.

    // Create Walls
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const wallThickness = 0.5; // meters
    // hallSize and wallHeight are now defined earlier, before the Lighting section.

    // Ethiopian Heritage Gallery - Portrait Collection of Influential Figures
    // Biographical information for each portrait in the gallery
    const ethiopianFigures = [
        {
            name: "Emperor Haile Selassie I",
            lifespan: "1892-1975",
            description: "Ethiopia's last emperor and a defining figure in modern Ethiopian history. He led Ethiopia through Italian occupation and into the modern era.",
            achievement: "Reformed Ethiopia's government, established the Organization of African Unity, and became a symbol of African independence.",
            imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/6553ea1081c347cfbbf9647d72632089.jpg"
        },
        {
            name: "Hachalu Hundessa",
            lifespan: "1986-2020",
            description: "Renowned Oromo singer, songwriter, and civil rights activist whose music became the soundtrack for a generation of political protests.",
            achievement: "Used his powerful voice and lyrics to advocate for the rights of the Oromo people and speak against political oppression.",
            imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/b2961240125547988bfdf1c4d274135b.jpg"
        },
        {
            name: "Tilahun Gessesse",
            lifespan: "1940-2009",
            description: "Known as 'The Voice' of Ethiopia's golden age of music. His career spanned over 40 years, recording hundreds of beloved songs.",
            achievement: "Received the lifetime achievement award from the Ethiopian Fine Art and Mass Media Prize Trust, and was mourned nationally upon his death.",
            imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/0debf78a21fc49e8b8a618827277501c"
        },
        {
            name: "Abebe Bikila",
            lifespan: "1932-1973",
            description: "Ethiopian marathon runner who made history as the first African to win an Olympic gold medal, famously running barefoot through Rome.",
            achievement: "Won gold medals in the 1960 and 1964 Olympics, breaking the world record both times and becoming an international sporting legend.",
            imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/aac029be01d742bab802ccdc9fcb9d33.jpg"
        },
        {
            name: "Tsegaye Gebre-Medhin",
            lifespan: "1936-2006",
            description: "Ethiopia's Poet Laureate who wrote numerous plays, poems, and translations. Often called the 'African Shakespeare'.",
            achievement: "Wrote over 30 plays, translated Shakespeare into Amharic, and received international awards including the Fulbright Fellowship.",
            imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/ebef8225ae244f969106028868379fc8.png"
        },
        {
            name: "Dawit Nega",
            lifespan: "1988-2022",
            description: "Beloved Tigrigna musician known for his powerful voice and emotional performances that resonated deeply with Ethiopian audiences.",
            achievement: "Created hit songs including 'Babailey' and 'Qdus Tsebaya' that became cultural touchstones in Ethiopian music.",
            imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/a78532be2bf94d91a1cc35d6e02aef72.jpg"
        },
        {
            name: "Emalaf Hiruy",
            lifespan: "20th century",
            description: "Pioneering Ethiopian artist who studied and taught modern art techniques while preserving traditional Ethiopian artistic expressions.",
            achievement: "Known for popularizing painting on Birana (animal skin canvas), helping to maintain this important Ethiopian artistic tradition.",
            imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/bf9623a4ba0c45d39b7d893dca2c164a.jpg"
        },
        {
            name: "Yishak Gezahegn",
            lifespan: "Contemporary",
            description: "Contemporary Ethiopian artist whose work is deeply inspired by Ethiopian history, mystical arts, and ancient scrolls.",
            achievement: "Creates distinctive works incorporating traditional patterns and designs while advancing Ethiopian visual art internationally.",
            imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/f60f07dccfa1425bb45c91aa8efb3483.jpg"
        },
        {
            name: "Aleka Elias",
            lifespan: "19th-20th century",
            description: "Traditional Ethiopian artist who mastered and preserved the ancient technique of painting on Birana (animal skin canvas).",
            achievement: "Helped maintain Ethiopia's artistic heritage during periods of significant cultural change and modernization.",
            imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/57de1648f66d4becabd9b60da4f70ff1.webp"
        },
        {
            name: "Afework Gebreyesus",
            lifespan: "20th century",
            description: "Master calligrapher who specialized in Ethiopian calligraphy, preserving the artistic traditions of Ge'ez script.",
            achievement: "Created works that maintained Ethiopia's rich tradition of sacred calligraphy and manuscript illumination.",
            imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/be40345061e9464bbe7f8287ea4c5eb1.jpg"
        },
        {
            name: "Teklehawariyat Teklemariam",
            lifespan: "Late 19th-early 20th century",
            description: "Pioneer of Ethiopian theater who made history by writing and staging the first play produced in Ethiopia.",
            achievement: "Created 'The Jest of Animal Comedians' in 1904/5, establishing the foundation for Ethiopian theatrical traditions.",
            imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/01207167754447de9450d255debfbfcf.jpg"
        },
        {
            name: "LÃ¡zaro di Andrade",
            lifespan: "16th century",
            description: "Portuguese artist who lived in Ethiopia during the 16th century, creating a cultural bridge between European and Ethiopian artistic traditions.",
            achievement: "May have been involved in creating the 'Kwer'ata Re'esu' icon, one of Ethiopia's most significant religious artworks.",
            imageUrl: "https://public.youware.com/users-website-assets/prod/6419359f-dc9e-4cfd-8db4-2a1656471496/7da07b3c517d4a129ace38007e3b5ddf.jpg"
        }
    ];
    
    // Extract just the image URLs for artwork placement
    const artworkImageUrls = ethiopianFigures.map(figure => figure.imageUrl);
    // textureLoader is already defined globally for the floor texture
    const artworkDepth = 0.05; // Slight extrusion from the wall
    // Base height for all artworks. Width will be calculated based on aspect ratio to prevent stretching.
    const baseArtworkHeight = 2.5; // A standard height for all artwork canvases.
    const artworkYPos = wallHeight / 2.2; 

    const createArtwork = (x, y, z, rotationY, imageUrl) => {
        // Create a group to hold the artwork. This allows us to position and rotate it
        // immediately, and then add the mesh asynchronously once the texture loads.
        const artworkGroup = new THREE.Group();
        artworkGroup.position.set(x, y, z);
        artworkGroup.rotation.y = rotationY;
        scene.add(artworkGroup);

        if (imageUrl) {
            textureLoader.load(
                imageUrl,
                // onLoad callback
                (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;

                    // Calculate aspect ratio from the loaded image
                    const aspectRatio = texture.image.naturalWidth / texture.image.naturalHeight;
                    
                    // Calculate dimensions based on the base height and aspect ratio
                    const artworkHeight = baseArtworkHeight;
                    const artworkWidth = artworkHeight * aspectRatio;

                    // Create geometry with the correct aspect ratio
                    const artworkGeo = new THREE.BoxGeometry(artworkWidth, artworkHeight, artworkDepth);
                    const artworkMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7, metalness: 0.1 });
                    
                    const artworkMesh = new THREE.Mesh(artworkGeo, artworkMaterial);
                    artworkMesh.castShadow = true;
                    artworkMesh.receiveShadow = true;
                    
                    // Add the mesh to the group. Its position is relative to the group, so (0,0,0) is correct.
                    artworkGroup.add(artworkMesh);
                    
                    // Store a reference to the artwork for raycasting
                    artworkMesh.userData.artworkIndex = artIndex - 1; // Since artIndex was incremented in getNextImageUrl
                    artworkMeshes.push(artworkMesh);
                },
                // onProgress callback (optional)
                undefined,
                // onError callback
                (err) => {
                    console.error(`An error occurred loading artwork: ${imageUrl}`, err);
                    // Add a reddish placeholder to the group on error to make it noticeable
                    const fallbackGeo = new THREE.BoxGeometry(baseArtworkHeight * 0.75, baseArtworkHeight, artworkDepth);
                    const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0x550000 });
                    const fallbackMesh = new THREE.Mesh(fallbackGeo, fallbackMaterial);
                    artworkGroup.add(fallbackMesh);
                    
                    // Store a reference to the fallback for raycasting
                    fallbackMesh.userData.artworkIndex = artIndex - 1;
                    artworkMeshes.push(fallbackMesh);
                }
            );
        } else {
            // Synchronously create a fallback placeholder if no image URL is provided
            const fallbackGeo = new THREE.BoxGeometry(baseArtworkHeight * 0.75, baseArtworkHeight, artworkDepth); // Default size
            const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, metalness: 0.0 });
            const fallbackMesh = new THREE.Mesh(fallbackGeo, fallbackMaterial);
            artworkGroup.add(fallbackMesh);
        }
    };

    // --- Artwork Placement ---
    // All positions are relative to the gallery center (0,0,0), where the bench is.
    // Artworks are placed so their back is flush with the inner surface of the walls.

    // Helper to get the next image URL, or null if we've used them all
    let artIndex = 0;
    const getNextImageUrl = () => (artIndex < artworkImageUrls.length) ? artworkImageUrls[artIndex++] : null;

    const ARTWORK_PLACEMENT_Y = artworkYPos; // artworkYPos is defined earlier as wallHeight / 2.2
    const ARTWORK_PLACEMENT_Y_HIGH = 4.5;    // For the specific high-placed artwork

    // Define an offset to move artworks from the wall surface towards the gallery center.
    const artworkOffsetFromWallTowardCenter = 0.3; // Adjusted: 0.7m from wall towards center.

    // Calculate the base distance from the gallery center (0,0,0) to where the artwork's center will be.
    // This accounts for hall size, wall thickness, artwork depth, and the new offset.
    const artworkCenterCoordinateMagnitude = hallSize / 2 - wallThickness / 2 - artworkDepth / 2 - artworkOffsetFromWallTowardCenter;

    // Coordinates for artwork centers on walls along negative and positive axes.
    const ART_PLACEMENT_NEG_AXIS = -artworkCenterCoordinateMagnitude;
    const ART_PLACEMENT_POS_AXIS =  artworkCenterCoordinateMagnitude;

    // Define offsets for placing artworks along the length of a wall (relative to wall center)
    const ALONG_WALL_OFFSET_CENTER = 0;
    const ALONG_WALL_OFFSET_SIDE = hallSize / 3.5; // e.g., positions at -5 and +5 for hallSize 20
    const ALONG_WALL_OFFSET_BACK_HIGH_LEFT_X = -hallSize / 8; // e.g., -2.5 for the high-left artwork

    // --- Create Artworks (3 per wall) --- 

    // Back wall artworks (-Z wall, facing +Z)
    createArtwork(-ALONG_WALL_OFFSET_SIDE, ARTWORK_PLACEMENT_Y, ART_PLACEMENT_NEG_AXIS, 0, getNextImageUrl());
    createArtwork( ALONG_WALL_OFFSET_SIDE, ARTWORK_PLACEMENT_Y, ART_PLACEMENT_NEG_AXIS, 0, getNextImageUrl());
    createArtwork( ALONG_WALL_OFFSET_CENTER, ARTWORK_PLACEMENT_Y, ART_PLACEMENT_NEG_AXIS, 0, getNextImageUrl());

    // Front wall artworks (+Z wall, facing -Z)
    createArtwork(-ALONG_WALL_OFFSET_SIDE, ARTWORK_PLACEMENT_Y, ART_PLACEMENT_POS_AXIS, Math.PI, getNextImageUrl());
    createArtwork( ALONG_WALL_OFFSET_SIDE, ARTWORK_PLACEMENT_Y, ART_PLACEMENT_POS_AXIS, Math.PI, getNextImageUrl());
    createArtwork( ALONG_WALL_OFFSET_CENTER, ARTWORK_PLACEMENT_Y, ART_PLACEMENT_POS_AXIS, Math.PI, getNextImageUrl()); // Moved from back wall

    // Left wall artworks (-X wall, facing +X)
    createArtwork(ART_PLACEMENT_NEG_AXIS, ARTWORK_PLACEMENT_Y, -ALONG_WALL_OFFSET_SIDE, Math.PI / 2, getNextImageUrl());
    createArtwork(ART_PLACEMENT_NEG_AXIS, ARTWORK_PLACEMENT_Y,  ALONG_WALL_OFFSET_CENTER, Math.PI / 2, getNextImageUrl());
    createArtwork(ART_PLACEMENT_NEG_AXIS, ARTWORK_PLACEMENT_Y,  ALONG_WALL_OFFSET_SIDE, Math.PI / 2, getNextImageUrl());

    // Right wall artworks (+X wall, facing -X)
    createArtwork(ART_PLACEMENT_POS_AXIS, ARTWORK_PLACEMENT_Y, -ALONG_WALL_OFFSET_SIDE, -Math.PI / 2, getNextImageUrl());
    createArtwork(ART_PLACEMENT_POS_AXIS, ARTWORK_PLACEMENT_Y,  ALONG_WALL_OFFSET_CENTER, -Math.PI / 2, getNextImageUrl());
    createArtwork(ART_PLACEMENT_POS_AXIS, ARTWORK_PLACEMENT_Y,  ALONG_WALL_OFFSET_SIDE, -Math.PI / 2, getNextImageUrl());

    function createWall(width, height, depth, x, y, z, rotationY = 0) {
        // Three.js Wall
        const wallGeo = new THREE.BoxGeometry(width, height, depth);
        const wallMesh = new THREE.Mesh(wallGeo, wallMaterial);
        wallMesh.position.set(x, y, z);
        if (rotationY !== 0) wallMesh.rotation.y = rotationY;
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        scene.add(wallMesh);

        // Cannon.js Wall
        const wallShape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
        const wallBody = new CANNON.Body({ mass: 0 }); // Static body
        wallBody.addShape(wallShape);
        wallBody.position.set(x, y, z);
        if (rotationY !== 0) wallBody.quaternion.setFromEuler(0, rotationY, 0);
        world.addBody(wallBody);
    }

    // const halfHallSize = hallSize / 2; // Moved to the top of init()
    const wallYPos = wallHeight / 2;

    // Front Wall (positive Z)
    createWall(hallSize, wallHeight, wallThickness, 0, wallYPos, halfHallSize - wallThickness / 2);
    // Back Wall (negative Z)
    createWall(hallSize, wallHeight, wallThickness, 0, wallYPos, -halfHallSize + wallThickness / 2);
    // Right Wall (positive X)
    createWall(wallThickness, wallHeight, hallSize, halfHallSize - wallThickness / 2, wallYPos, 0, 0);
    // Left Wall (negative X)
    createWall(wallThickness, wallHeight, hallSize, -halfHallSize + wallThickness / 2, wallYPos, 0, 0);


    // Pointer Lock Controls Setup
    const instructions = document.createElement('div');
    instructions.innerHTML = 'Click to play';
    instructions.style.position = 'absolute';
    instructions.style.top = '50%';
    instructions.style.left = '50%';
    instructions.style.transform = 'translate(-50%, -50%)';
    instructions.style.fontSize = '24px';
    instructions.style.color = 'white';
    instructions.style.backgroundColor = 'rgba(0,0,0,0.5)';
    instructions.style.padding = '10px';
    instructions.style.cursor = 'pointer';
    document.body.appendChild(instructions);

    instructions.addEventListener('click', () => {
        document.body.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', onPointerLockChange, false);
    document.addEventListener('pointerlockerror', onPointerLockError, false);
    document.addEventListener('mousemove', onMouseMove, false);
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);
    document.addEventListener('mousemove', updateMousePosition, false);

    window.addEventListener('resize', onWindowResize, false);

    animate();
}

function onPointerLockChange() {
    if (document.pointerLockElement === document.body) {
        controlsEnabled = true;
        const instructions = document.querySelector('div[style*="absolute"]');
        if (instructions) instructions.style.display = 'none';
    } else {
        controlsEnabled = false;
        const instructions = document.querySelector('div[style*="absolute"]');
        if (instructions) instructions.style.display = 'block';
    }
}

function onPointerLockError() {
    console.error('PointerLock Error');
}

function onMouseMove(event) {
    if (!controlsEnabled) return;

    const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

    _euler.setFromQuaternion(camera.quaternion); // Get current camera orientation

    _euler.y -= movementX * 0.002; // Yaw (rotation around Y axis)
    _euler.x -= movementY * 0.002; // Pitch (rotation around X axis)

    // Clamp pitch angle
    _euler.x = Math.max(minPitchAngle, Math.min(maxPitchAngle, _euler.x));

    camera.quaternion.setFromEuler(_euler); // Apply the new orientation
}

// Track mouse position for raycasting
function updateMousePosition(event) {
    // Update the mouse position for raycasting
    // Since we're using pointer lock, we'll use the center of the screen
    mouse.x = 0;
    mouse.y = 0;
}

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
        case 'Space': if (isOnGround) canJump = true; break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyD': moveRight = false; break;
    }
}

function onPlayerCollision({ contact }) {
    // Check if the contact normal is pointing upwards, indicating we are on something.
    const contactNormal = new CANNON.Vec3();
    const upAxis = new CANNON.Vec3(0, 1, 0);
    // contact.bi and contact.bj are the colliding bodies
    // contact.ni is the contact normal
    // We need to check if the normal is against the player's direction of gravity
    if (contact.bi.id === playerBody.id) { // If body A is the player
        contact.ni.negate(contactNormal); // Normal points away from body A
    } else { // If body B is the player
        contactNormal.copy(contact.ni); // Normal points away from body A (towards B)
    }
    // If the dot product is high, it means we are on a fairly flat surface
    if (contactNormal.dot(upAxis) > 0.5) {
        isOnGround = true;
    }
}

function updatePlayer(deltaTime) {
    if (!controlsEnabled && !playerBody) return;

    const inputVelocity = new THREE.Vector3();
    
    // Create a temporary Euler angle to get the current camera yaw
    const cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    cameraEuler.setFromQuaternion(camera.quaternion); // Get current orientation from the camera's quaternion

    // We only want the yaw component (rotation around Y axis) for movement direction.
    // Create a new Euler with only the yaw from the camera.
    const movementEuler = new THREE.Euler(0, cameraEuler.y, 0, 'YXZ');

    if (moveForward) inputVelocity.z = -playerMoveSpeed;
    if (moveBackward) inputVelocity.z = playerMoveSpeed;
    if (moveLeft) inputVelocity.x = -playerMoveSpeed;
    if (moveRight) inputVelocity.x = playerMoveSpeed;

    // Apply the camera's YAW rotation to the movement vector
    inputVelocity.applyEuler(movementEuler);

    playerBody.velocity.x = inputVelocity.x;
    playerBody.velocity.z = inputVelocity.z;

    if (canJump && isOnGround) {
        playerBody.velocity.y = playerJumpVelocity;
        canJump = false;
        isOnGround = false; // Assume we are not on ground immediately after jump
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Display information about the Ethiopian figure
function showFigureInfo(figureIndex) {
    if (figureIndex === undefined || figureIndex < 0 || figureIndex >= ethiopianFigures.length) {
        hideInfoOverlay();
        return;
    }
    
    const figure = ethiopianFigures[figureIndex];
    
    // Update the overlay with the figure's information
    document.getElementById('figureName').textContent = figure.name;
    document.getElementById('figureLifespan').textContent = figure.lifespan;
    document.getElementById('figureDescription').textContent = figure.description;
    document.getElementById('figureAchievement').textContent = figure.achievement;
    
    // Show the overlay
    infoOverlay.style.display = 'block';
}

function hideInfoOverlay() {
    if (infoOverlay) {
        infoOverlay.style.display = 'none';
    }
    currentlyViewedArtwork = null;
}

// Check if the player is looking at any artwork
function checkArtworkView() {
    if (!camera || !raycaster || !artworkMeshes.length) return;
    
    // Only update at certain intervals to improve performance
    const now = Date.now();
    if (now - lastInfoUpdateTime < INFO_UPDATE_INTERVAL) return;
    lastInfoUpdateTime = now;
    
    // Update the raycaster with the camera's position/direction
    raycaster.setFromCamera(mouse, camera);
    
    // Calculate objects intersecting the ray
    const intersects = raycaster.intersectObjects(artworkMeshes);
    
    if (intersects.length > 0) {
        // User is looking at an artwork
        const artworkIndex = intersects[0].object.userData.artworkIndex;
        
        // If it's a different artwork than the one currently displayed
        if (currentlyViewedArtwork !== artworkIndex) {
            currentlyViewedArtwork = artworkIndex;
            showFigureInfo(artworkIndex);
        }
    } else if (currentlyViewedArtwork !== null) {
        // User is no longer looking at any artwork
        hideInfoOverlay();
    }
}

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();

    if (controlsEnabled || document.pointerLockElement === document.body) {
         updatePlayer(deltaTime);
         // Check if player is viewing an artwork
         checkArtworkView();
    }
   
    // Step the physics world
    if (world) {
        world.step(cannonStep, deltaTime, 3);

        // Update Three.js meshes based on Cannon.js bodies (e.g., the example box)
        // Update Three.js meshes based on Cannon.js bodies (if any other than player)
        scene.traverse(function(object) {
            // Ensure we are not trying to update the player's visual representation here,
            // as the camera itself is the player's visual representation in FPV.
            // If we had a visible player model, we would update it here.
            // For now, this loop might only be relevant if we add other dynamic physics objects.
            if (object.isMesh && object.userData.physicsBody && object.userData.physicsBody !== playerBody) {
                object.position.copy(object.userData.physicsBody.position);
                object.quaternion.copy(object.userData.physicsBody.quaternion);
            }
        });

        // Update camera position to player body
        if (playerBody) {
            const targetPosition = new THREE.Vector3();
            targetPosition.copy(playerBody.position);
            targetPosition.y += playerEyeHeight;
            camera.position.lerp(targetPosition, 0.2); // Adjust 0.2 for more/less smoothing
        }
    }

    renderer.render(scene, camera);
}

init();

//dagi make's stuff lol forget about the mit and use it
