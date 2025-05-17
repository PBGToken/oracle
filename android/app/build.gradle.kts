import org.gradle.api.tasks.Exec
import org.gradle.api.tasks.Copy

plugins {
    alias(libs.plugins.androidApplication)
}

android {
    namespace = "pbg.oracle.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "pbg.oracle.app"
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            // TODO: Update paths & passwords here
            storeFile = file("release-key.jks")  // path relative to project root
            storePassword = System.getenv("RELEASE_STORE_PASSWORD") ?: project.property("RELEASE_STORE_PASSWORD") as String
            keyAlias = System.getenv("RELEASE_KEY_ALIAS") ?: project.property("RELEASE_KEY_ALIAS") as String
            keyPassword = System.getenv("RELEASE_KEY_PASSWORD") ?: project.property("RELEASE_KEY_PASSWORD") as String
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}

dependencies {
    implementation(libs.appcompat)
    implementation(libs.material)
    implementation(libs.activity)
    implementation(libs.constraintlayout)
    implementation("com.bloxbean.cardano:cardano-client-lib:0.5.1")
    implementation("com.upokecenter:cbor:4.5.2")
    testImplementation(libs.junit)
    androidTestImplementation(libs.ext.junit)
    androidTestImplementation(libs.espresso.core)
}

val copyReleaseApk by tasks.registering(Copy::class) {
    val apkName = "pbg_oracle.apk"
    val buildOutputDir = file("$buildDir/outputs/apk/release")
    val distDir = file("${rootProject.projectDir}/../dist")

    from(buildOutputDir) {
        include("*.apk")
        rename { apkName }
    }
    into(distDir)
}

tasks.whenTaskAdded {
    if (name == "assembleRelease") {
        finalizedBy(copyReleaseApk)
    }
}
