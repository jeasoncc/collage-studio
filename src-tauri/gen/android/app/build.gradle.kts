import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

// Keep release credentials outside the repository and Gradle command-line arguments.
val releaseSigning = listOf(
    "COLLAGE_ANDROID_KEYSTORE",
    "COLLAGE_ANDROID_STORE_PASSWORD",
    "COLLAGE_ANDROID_KEY_ALIAS",
    "COLLAGE_ANDROID_KEY_PASSWORD",
).associateWith { System.getenv(it)?.takeIf(String::isNotBlank) }
require(releaseSigning.values.all { it == null } || releaseSigning.values.all { it != null }) {
    "Set all four COLLAGE_ANDROID_* signing variables, or none to build an unsigned release."
}

android {
    compileSdk = 36
    ndkVersion = "27.2.12479018"
    namespace = "top.szlh.collage"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "top.szlh.collage"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        if (releaseSigning.values.all { it != null }) {
            create("distribution") {
                storeFile = file(releaseSigning.getValue("COLLAGE_ANDROID_KEYSTORE")!!)
                storePassword = releaseSigning.getValue("COLLAGE_ANDROID_STORE_PASSWORD")
                keyAlias = releaseSigning.getValue("COLLAGE_ANDROID_KEY_ALIAS")
                keyPassword = releaseSigning.getValue("COLLAGE_ANDROID_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            signingConfig = signingConfigs.findByName("distribution")
            optimization {
               enable = true
            }
            proguardFiles(
                *fileTree(".") {
                  include("**/*.pro")
                  exclude("build/**")
                }.files.toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = file("tauri.build.gradle.kts"))
